import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { CampaignStatus, CreateCampaign } from "@mirai/contracts";
import { users } from "../sessions/schema.js";

export const campaigns = users.table(
  "campaigns",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    chatSessionId: text("chat_session_id").notNull(),
    title: text("title").notNull(),
    mandate: text("mandate").notNull(),
    criteria: jsonb("criteria").$type<CreateCampaign["criteria"]>().notNull(),
    maxApplications: integer("max_applications"),
    status: text("status").$type<CampaignStatus>().notNull(),
    statusReason: text("status_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    unique("campaigns_account_id_unique").on(t.accountId, t.id),
    index("campaigns_account_updated").on(t.accountId, t.updatedAt.desc(), t.id),
    index("campaigns_account_chat_updated").on(t.accountId, t.chatSessionId, t.updatedAt.desc()),
    check("campaigns_status", sql`${t.status} IN ('running','stopped','completed','failed')`),
    check("campaigns_max_applications", sql`${t.maxApplications} > 0`),
    check("campaigns_criteria_object", sql`jsonb_typeof(${t.criteria}) = 'object'`),
  ],
);
