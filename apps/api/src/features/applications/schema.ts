import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ApplicationStatus, DocumentRef } from "@mirai/contracts";
import { users } from "../sessions/schema.js";
import { campaigns } from "../campaigns/schema.js";

export const applications = users.table(
  "applications",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    campaignId: uuid("campaign_id").notNull(),
    companyName: text("company_name").notNull(),
    jobTitle: text("job_title").notNull(),
    jobUrl: text("job_url").notNull(),
    platform: text("platform"),
    location: text("location"),
    status: text("status").$type<ApplicationStatus>().notNull(),
    statusReason: text("status_reason"),
    documentRefs: jsonb("document_refs").$type<DocumentRef[]>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "applications_campaign_account_fk",
      columns: [t.accountId, t.campaignId],
      foreignColumns: [campaigns.accountId, campaigns.id],
    }).onDelete("restrict"),
    index("applications_account_updated").on(t.accountId, t.updatedAt.desc(), t.id),
    index("applications_account_campaign_updated").on(
      t.accountId,
      t.campaignId,
      t.updatedAt.desc(),
      t.id,
    ),
    index("applications_account_status_updated").on(
      t.accountId,
      t.status,
      t.updatedAt.desc(),
      t.id,
    ),
    check(
      "applications_status",
      sql`${t.status} IN ('confirmed','unconfirmed','pending_review','failed','skipped')`,
    ),
    check("applications_document_refs_array", sql`jsonb_typeof(${t.documentRefs}) = 'array'`),
    check(
      "applications_explain_outcome",
      sql`${t.status} IN ('confirmed','skipped') OR nullif(trim(${t.statusReason}), '') IS NOT NULL`,
    ),
  ],
);
