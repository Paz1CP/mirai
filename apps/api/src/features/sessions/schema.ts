import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const accountControllers = pgTable(
  "account_controllers",
  {
    accountId: text("account_id").primaryKey(),
    instanceId: uuid("instance_id").notNull(),
    epoch: bigint("epoch", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [check("controller_epoch_positive", sql`${table.epoch} > 0`)],
);

export const extensionChallenges = pgTable("extension_challenges", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accountControllers.accountId, { onDelete: "cascade" }),
  instanceId: uuid("instance_id").notNull(),
  epoch: bigint("epoch", { mode: "bigint" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const linkedExtensions = pgTable("linked_extensions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: text("account_id")
    .notNull()
    .references(() => accountControllers.accountId, { onDelete: "cascade" }),
  installationId: uuid("installation_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  instanceId: uuid("instance_id").notNull(),
  epoch: bigint("epoch", { mode: "bigint" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
