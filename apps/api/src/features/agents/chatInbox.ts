import type { ChatEvent, SendChat } from "@mirai/contracts";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { createDatabase } from "../../infrastructure/database/client.js";
import { queuedUserContent } from "./chatEvents.js";
import { chatInbox, chatOwners } from "./schema.js";

export function createChatInbox(db: ReturnType<typeof createDatabase>["db"]) {
  const owner = (accountId: string, chatId: string) =>
    and(eq(chatOwners.accountId, accountId), eq(chatOwners.chatId, chatId));
  const scope = (accountId: string, chatId: string) =>
    and(eq(chatInbox.accountId, accountId), eq(chatInbox.chatId, chatId));
  const pending = (accountId: string, chatId: string) =>
    and(scope(accountId, chatId), isNotNull(chatInbox.payload));

  return {
    async rememberChats(accountId: string, chatIds: string[]) {
      if (chatIds.length)
        await db.insert(chatOwners).values(chatIds.map((chatId) => ({ accountId, chatId })))
          .onConflictDoNothing();
    },
    async removeChat(accountId: string, chatId: string) {
      await db.delete(chatOwners).where(owner(accountId, chatId));
    },
    async accept(accountId: string, chatId: string, message: SendChat) {
      const visible: ChatEvent = {
        id: message.id,
        at: new Date().toISOString(),
        role: "user",
        ...queuedUserContent(message),
        queued: true,
      };
      // The owner row orders admissions for this chat, independently of its execution lock.
      const { rows } = await db.execute<{ authorized: boolean; inserted: boolean }>(sql`
        with authorized as (
          select account_id, chat_id from ${chatOwners} where ${owner(accountId, chatId)}
          for no key update
        ), inserted as (
          insert into ${chatInbox} (account_id, chat_id, message_id, payload, visible)
          select account_id, chat_id, ${message.id}::uuid,
            ${JSON.stringify(message)}::jsonb, ${JSON.stringify(visible)}::jsonb
          from authorized
          on conflict (account_id, chat_id, message_id) do nothing
          returning message_id
        )
        select exists(select 1 from authorized) as authorized,
          exists(select 1 from inserted) as inserted
      `);
      return !rows[0]?.authorized ? null : { inserted: rows[0].inserted, visible };
    },
    async pendingChats(accountId: string) {
      return db.selectDistinct({ chatId: chatInbox.chatId }).from(chatInbox)
        .where(and(eq(chatInbox.accountId, accountId), isNotNull(chatInbox.payload)));
    },
    async pendingIds(accountId: string, chatId: string) {
      return db.select({ id: chatInbox.messageId }).from(chatInbox)
        .where(pending(accountId, chatId)).orderBy(asc(chatInbox.position));
    },
    async load(accountId: string, chatId: string, id: string) {
      const [row] = await db.select({ payload: chatInbox.payload }).from(chatInbox)
        .where(and(pending(accountId, chatId), eq(chatInbox.messageId, id)));
      return row?.payload;
    },
    async claim(accountId: string, chatId: string, id: string) {
      const [row] = await db.update(chatInbox).set({ payload: null, visible: null })
        .where(and(pending(accountId, chatId), eq(chatInbox.messageId, id)))
        .returning({ id: chatInbox.messageId });
      return Boolean(row);
    },
    async cancel(accountId: string, chatId: string, ids: string[], error?: string) {
      if (ids.length)
        await db.update(chatInbox).set({
          payload: null,
          visible: sql`${chatInbox.visible} - 'queued' - 'attachments'`,
          error,
        }).where(and(pending(accountId, chatId), inArray(chatInbox.messageId, ids)));
    },
    async visible(accountId: string, chatId: string) {
      return db.select({ event: chatInbox.visible, error: chatInbox.error }).from(chatInbox)
        .where(and(scope(accountId, chatId), isNotNull(chatInbox.visible)))
        .orderBy(asc(chatInbox.position));
    },
  };
}
