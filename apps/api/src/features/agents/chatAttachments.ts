import { createHash } from "node:crypto";
import type { Part } from "@google/genai";
import { sendChatSchema, type QueuedMessage, type SendChat } from "@mirai/contracts";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { originalDocuments } from "../cvs/schema.js";
import {
  adoptDocument,
  checkOriginalCapacity,
  lockStoredFiles,
  type createDocumentCleanup,
} from "../profiles/documentCleanup.js";
import type { createDocumentStorage } from "../profiles/documentStorage.js";
import { documentPart } from "../profiles/extractProfile.js";
import { ChatError } from "./managedChats.js";
import { queuedChatAttachments } from "./schema.js";

export function createQueuedAttachments(
  db: ReturnType<typeof createDatabase>["db"],
  storage: ReturnType<typeof createDocumentStorage>,
  cleanup: ReturnType<typeof createDocumentCleanup>,
) {
  const messageRows = (accountId: string, chatId: string, messageId: string) =>
    and(
      eq(queuedChatAttachments.accountId, accountId),
      eq(queuedChatAttachments.chatId, chatId),
      eq(queuedChatAttachments.messageId, messageId),
    );
  function originals(accountId: string, ids: string[]) {
    return ids.length
      ? db
          .select({ id: originalDocuments.id, key: originalDocuments.key })
          .from(originalDocuments)
          .where(
            and(eq(originalDocuments.accountId, accountId), inArray(originalDocuments.id, ids)),
          )
      : Promise.resolve([]);
  }
  return {
    async save(accountId: string, chatId: string, message: SendChat): Promise<QueuedMessage> {
      const attachments = message.attachments ?? [];
      const referenced = await originals(
        accountId,
        attachments.flatMap(({ originalId }) => (originalId ? [originalId] : [])),
      );
      const keys = new Map(referenced.map(({ id, key }) => [id, key]));
      const pendingOriginals = attachments.flatMap(({ name, mimeType, data, originalId }) => {
        if (!originalId) return [];
        if (
          mimeType !== "application/pdf" &&
          mimeType !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
          throw new ChatError("INVALID_ATTACHMENT", 400);
        const key = keys.get(originalId);
        if (!key)
          return [
            { id: originalId, source: { name, mimeType, buffer: Buffer.from(data, "base64") } },
          ];
        const digest = createHash("sha256").update(Buffer.from(data, "base64")).digest("hex");
        const extension = mimeType === "application/pdf" ? "pdf" : "docx";
        if (!key.endsWith(`-${digest}.${extension}`))
          throw new ChatError("INVALID_ATTACHMENT", 400);
        return [];
      });
      if (new Set(pendingOriginals.map(({ id }) => id)).size !== pendingOriginals.length)
        throw new ChatError("INVALID_ATTACHMENT", 400);
      const rows = attachments.flatMap(({ name, data, originalId }, position) =>
        originalId ? [] : [{ accountId, chatId, messageId: message.id, position, name, data }],
      );
      if (rows.length || pendingOriginals.length) {
        const existing = await db
          .select({ position: queuedChatAttachments.position })
          .from(queuedChatAttachments)
          .where(messageRows(accountId, chatId, message.id));
        const positions = new Set(existing.map(({ position }) => position));
        const fresh = rows.filter(({ position }) => !positions.has(position));
        await checkOriginalCapacity(db, accountId, fresh.length + pendingOriginals.length);
        const staged = await Promise.all(
          pendingOriginals.map(async ({ id, source }) => ({
            id,
            name: source.name,
            key: await cleanup.stage(accountId, source).catch(() => {
              throw new ChatError("STORAGE_FAILED", 502);
            }),
          })),
        );
        await db.transaction(async (tx) => {
          await lockStoredFiles(tx, accountId);
          await checkOriginalCapacity(tx, accountId, fresh.length + staged.length);
          for (const { id, key, name } of staged) await adoptDocument(tx, accountId, key, name, id);
          if (fresh.length) await tx.insert(queuedChatAttachments).values(fresh);
        });
      }
      return {
        ...message,
        attachments: attachments.map(({ name, mimeType, originalId }, position) => ({
          name,
          mimeType,
          originalId,
          position,
        })),
      };
    },
    async restore(
      accountId: string,
      chatId: string,
      message: QueuedMessage,
    ): Promise<SendChat["attachments"]> {
      const files = message.attachments ?? [];
      if (!files.some((file) => "position" in file))
        return sendChatSchema.parse(message).attachments;
      const [rows, referenced] = await Promise.all([
        db
          .select({ position: queuedChatAttachments.position, data: queuedChatAttachments.data })
          .from(queuedChatAttachments)
          .where(messageRows(accountId, chatId, message.id)),
        originals(
          accountId,
          files.flatMap(({ originalId }) => (originalId ? [originalId] : [])),
        ),
      ]);
      const bytes = new Map(rows.map(({ position, data }) => [position, data]));
      const keys = new Map(referenced.map(({ id, key }) => [id, key]));
      const restored = await Promise.all(
        files.map(async (file) => {
          if (!("position" in file)) return file;
          const key = file.originalId && keys.get(file.originalId);
          const data = key
            ? (await storage.read(accountId, key)).toString("base64")
            : bytes.get(file.position);
          return data ? { ...file, data } : undefined;
        }),
      );
      return restored.filter((file) => file !== undefined);
    },
    list(accountId: string) {
      return db
        .select({
          chatId: queuedChatAttachments.chatId,
          messageId: queuedChatAttachments.messageId,
          position: queuedChatAttachments.position,
          name: queuedChatAttachments.name,
        })
        .from(queuedChatAttachments)
        .where(eq(queuedChatAttachments.accountId, accountId))
        .orderBy(desc(queuedChatAttachments.createdAt));
    },
    async remove(accountId: string, chatId: string, messageId: string, position: number) {
      await db
        .delete(queuedChatAttachments)
        .where(
          and(
            messageRows(accountId, chatId, messageId),
            eq(queuedChatAttachments.position, position),
          ),
        );
    },
  };
}

export async function prepareChatAttachments(files: SendChat["attachments"] = []): Promise<Part[]> {
  const parts: Part[] = [];
  for (const { name, mimeType, data } of files) {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024)
      throw new ChatError("INVALID_ATTACHMENT", 400);

    parts.push({ text: name });
    if (mimeType.startsWith("image/")) {
      const valid =
        mimeType === "image/png"
          ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mimeType === "image/jpeg"
            ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
              buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!valid) throw new ChatError("INVALID_ATTACHMENT", 400);
      parts.push({ inlineData: { mimeType, data } });
    } else {
      try {
        parts.push(await documentPart({ name, mimeType, buffer }));
      } catch {
        throw new ChatError("INVALID_ATTACHMENT", 400);
      }
    }
  }
  return parts;
}
