import type { Part } from "@google/genai";
import { sendChatSchema, type QueuedMessage, type SendChat } from "@mirai/contracts";
import { and, eq } from "drizzle-orm";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { documentPart } from "../profiles/extractProfile.js";
import { ChatError } from "./managedChats.js";
import { queuedChatAttachments } from "./schema.js";

export function createQueuedAttachments(db: ReturnType<typeof createDatabase>["db"]) {
  const messageRows = (accountId: string, chatId: string, messageId: string) =>
    and(
      eq(queuedChatAttachments.accountId, accountId),
      eq(queuedChatAttachments.chatId, chatId),
      eq(queuedChatAttachments.messageId, messageId),
    );
  return {
    async save(accountId: string, chatId: string, message: SendChat): Promise<QueuedMessage> {
      const attachments = message.attachments ?? [];
      if (attachments.length)
        await db
          .insert(queuedChatAttachments)
          .values(
            attachments.map(({ data }, position) => ({
              accountId,
              chatId,
              messageId: message.id,
              position,
              data,
            })),
          )
          .onConflictDoNothing();
      return {
        ...message,
        attachments: attachments.map(({ name, mimeType }, position) => ({
          name,
          mimeType,
          position,
        })),
      };
    },
    async restore(accountId: string, chatId: string, message: QueuedMessage): Promise<SendChat> {
      if (!message.attachments?.some((file) => "position" in file))
        return sendChatSchema.parse(message);
      const rows = await db
        .select()
        .from(queuedChatAttachments)
        .where(messageRows(accountId, chatId, message.id));
      const byPosition = new Map(rows.map(({ position, data }) => [position, data]));
      return sendChatSchema.parse({
        ...message,
        attachments: message.attachments.map((file) =>
          "position" in file ? { ...file, data: byPosition.get(file.position) } : file,
        ),
      });
    },
    async remove(accountId: string, chatId: string, messageId?: string) {
      await db
        .delete(queuedChatAttachments)
        .where(
          messageId
            ? messageRows(accountId, chatId, messageId)
            : and(
                eq(queuedChatAttachments.accountId, accountId),
                eq(queuedChatAttachments.chatId, chatId),
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
