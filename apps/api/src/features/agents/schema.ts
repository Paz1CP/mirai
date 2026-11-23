import { sql } from "drizzle-orm";
import { bigint, foreignKey, index, integer, jsonb, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ChatEvent, SendChat } from "@mirai/contracts";
import { users } from "../sessions/schema.js";

export const chatOwners = users.table(
  "chat_owners",
  { accountId: text("account_id").notNull(), chatId: text("chat_id").notNull() },
  (table) => [primaryKey({ columns: [table.accountId, table.chatId] })],
);

export const chatInbox = users.table(
  "chat_inbox",
  {
    accountId: text("account_id").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: uuid("message_id").notNull(),
    position: bigint("position", { mode: "bigint" }).generatedAlwaysAsIdentity(),
    payload: jsonb("payload").$type<SendChat>(),
    visible: jsonb("visible").$type<ChatEvent>(),
    error: text("error"),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.chatId, table.messageId] }),
    foreignKey({
      columns: [table.accountId, table.chatId],
      foreignColumns: [chatOwners.accountId, chatOwners.chatId],
    }).onDelete("cascade"),
    index("chat_inbox_pending_idx")
      .on(table.accountId, table.chatId, table.position)
      .where(sql`${table.payload} is not null`),
  ],
);

export const queuedChatAttachments = users.table(
  "queued_chat_attachments",
  {
    accountId: text("account_id").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: uuid("message_id").notNull(),
    position: integer("position").notNull(),
    name: text("name"),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.chatId, table.messageId, table.position] }),
  ],
);

// Existing rows store Base64 bytes but do not have a MIME column.
export const storedChatImageMime = sql<"image/png" | "image/jpeg" | "image/webp" | null>`
  case
    when left(${queuedChatAttachments.data}, 10) = 'iVBORw0KGg' then 'image/png'
    when left(${queuedChatAttachments.data}, 4) = '/9j/' then 'image/jpeg'
    when left(${queuedChatAttachments.data}, 5) = 'UklGR'
      and substring(${queuedChatAttachments.data}, 13, 4) = 'RUJQ' then 'image/webp'
  end
`;
