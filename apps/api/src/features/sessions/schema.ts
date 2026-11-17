import { pgSchema, text, uuid } from "drizzle-orm/pg-core";
export const users = pgSchema("users");
export const accountControllers = users.table("account_controllers", {
  accountId: text("account_id").primaryKey(),
  instanceId: uuid("instance_id").notNull(),
});
