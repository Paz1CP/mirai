import { index, integer, jsonb, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../sessions/schema.js";

export const queuedChatAttachments = users.table(
  "queued_chat_attachments",
  {
    accountId: text("account_id").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: uuid("message_id").notNull(),
    position: integer("position").notNull(),
    data: text("data").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.chatId, table.messageId, table.position] }),
  ],
);

export const agentRelayMessages = users.table(
  "agent_relay_messages",
  {
    id: uuid("id").primaryKey(),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("agent_relay_expiry").on(table.expiresAt)],
);

export const browserTickets = users.table(
  "browser_tickets",
  {
    digest: text("digest").primaryKey(),
    accountId: text("account_id").notNull(),
    instanceId: uuid("instance_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("browser_ticket_expiry").on(table.expiresAt)],
);

export const browserRoutes = users.table("browser_routes", {
  accountId: text("account_id").primaryKey(),
  instanceId: uuid("instance_id").notNull(),
  socketId: uuid("socket_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
