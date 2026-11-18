import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ProfessionalProfile } from "@mirai/contracts";
import { users } from "../sessions/schema.js";
import { candidateProfiles } from "../profiles/schema.js";

export const cvDocuments = users.table(
  "cv_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => candidateProfiles.accountId),
    kind: text("kind", { enum: ["primary", "variant"] }).notNull(),
    name: text("name").notNull(),
    specialization: text("specialization").notNull().default(""),
    profile: jsonb("profile").$type<ProfessionalProfile>(),
    sourceKey: text("source_key"),
    isDefault: boolean("is_default").notNull().default(false),
    revision: uuid("revision").notNull().defaultRandom(),
    lastReplacementId: uuid("last_replacement_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cv_documents_account_updated").on(t.accountId, t.updatedAt.desc(), t.id),
    uniqueIndex("cv_one_primary")
      .on(t.accountId)
      .where(sql`${t.kind} = 'primary'`),
    uniqueIndex("cv_one_default")
      .on(t.accountId)
      .where(sql`${t.isDefault}`),
    check(
      "cv_metadata_length",
      sql`length(trim(${t.name})) BETWEEN 1 AND 120 AND length(${t.specialization}) <= 120`,
    ),
    check(
      "cv_valid_kind_content",
      sql`(${t.kind} = 'primary' AND ${t.profile} IS NULL AND ${t.sourceKey} IS NULL AND NOT ${t.isDefault})
        OR (${t.kind} = 'variant' AND ${t.profile} IS NOT NULL AND jsonb_typeof(${t.profile}) = 'object' AND ${t.lastReplacementId} IS NULL)`,
    ),
  ],
);

export const documentCleanup = users.table(
  "document_cleanup",
  {
    key: text("key").primaryKey(),
    accountId: text("account_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("document_cleanup_account_due").on(t.accountId, t.dueAt)],
);

export const originalDocuments = users.table(
  "original_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id")
      .notNull()
      .references(() => candidateProfiles.accountId, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("original_documents_account_created").on(t.accountId, t.createdAt.desc(), t.id)],
);
