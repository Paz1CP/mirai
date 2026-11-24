import { text, timestamp } from "drizzle-orm/pg-core";
import { users } from "../sessions/schema.js";

export const accountDeletions = users.table("account_deletions", {
  accountId: text("account_id").primaryKey(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
});
