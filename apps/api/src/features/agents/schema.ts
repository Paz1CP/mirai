import { integer, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../sessions/schema.js";

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
