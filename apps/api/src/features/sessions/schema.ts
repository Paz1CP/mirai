import { pgTable, text, uuid } from "drizzle-orm/pg-core";
export const accountControllers = pgTable("account_controllers", {
  accountId: text("account_id").primaryKey(),
  instanceId: uuid("instance_id").notNull(),
});
