import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { preferenceOptions, type CvExtraction, type ProfessionalProfile } from "@mirai/contracts";
import { users } from "../sessions/schema.js";
export const contract_type = users.enum("contract_type", preferenceOptions.contract_type);
export const industry = users.enum("industry", preferenceOptions.industry);
export const salary_period = users.enum("salary_period", preferenceOptions.salary_period);
export const seniority = users.enum("seniority", preferenceOptions.seniority);
export const work_language = users.enum("work_language", preferenceOptions.work_language);
export const work_mode = users.enum("work_mode", preferenceOptions.work_mode);
export const work_schedule = users.enum("work_schedule", preferenceOptions.work_schedule);

export const candidateProfiles = users.table(
  "candidate_profiles",
  {
    accountId: text("account_id").primaryKey(),
    cvUrl: text("cv_url"),
    evidenceUrls: text("evidence_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    extraction: jsonb("extraction").$type<CvExtraction>(),
    profile: jsonb("profile").$type<ProfessionalProfile>(),
    revision: uuid("revision").notNull().defaultRandom(),
    profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmed: boolean("confirmed").notNull().default(false),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    extractionOperationId: uuid("extraction_operation_id"),
  },
  (t) => [
    check("confirmed_profile", sql`NOT ${t.confirmed} OR ${t.profile} IS NOT NULL`),
    check(
      "extraction_object",
      sql`${t.extraction} IS NULL OR jsonb_typeof(${t.extraction}) = 'object'`,
    ),
    check("profile_object", sql`${t.profile} IS NULL OR jsonb_typeof(${t.profile}) = 'object'`),
  ],
);
export const jobPreferences = users.table(
  "job_preferences",
  {
    accountId: text("account_id").primaryKey(),
    roles: text("roles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    roles_required: boolean("roles_required").notNull().default(false),
    seniority_required: boolean("seniority_required").notNull().default(false),
    industries_required: boolean("industries_required").notNull().default(false),
    work_modes_required: boolean("work_modes_required").notNull().default(false),
    locations_required: boolean("locations_required").notNull().default(false),
    salary_required: boolean("salary_required").notNull().default(false),
    schedules_required: boolean("schedules_required").notNull().default(false),
    contracts_required: boolean("contracts_required").notNull().default(false),
    languages_required: boolean("languages_required").notNull().default(false),
    mobility_required: boolean("mobility_required").notNull().default(false),
    seniorities: seniority("seniorities")
      .array()
      .notNull()
      .default(sql`'{}'::users.seniority[]`),
    industries: industry("industries")
      .array()
      .notNull()
      .default(sql`'{}'::users.industry[]`),
    work_modes: work_mode("work_modes")
      .array()
      .notNull()
      .default(sql`'{}'::users.work_mode[]`),
    schedules: work_schedule("schedules")
      .array()
      .notNull()
      .default(sql`'{}'::users.work_schedule[]`),
    contracts: contract_type("contracts")
      .array()
      .notNull()
      .default(sql`'{}'::users.contract_type[]`),
    work_languages: work_language("work_languages")
      .array()
      .notNull()
      .default(sql`'{}'::users.work_language[]`),
    locations: jsonb("locations")
      .$type<Array<{ country: string; region?: string }>>()
      .notNull()
      .default([]),
    salary_amount: numeric("salary_amount"),
    salary_currency: text("salary_currency"),
    salary_period: salary_period("salary_period"),
    relocation: boolean("relocation"),
    visa_sponsorship: boolean("visa_sponsorship"),
    custom_rules: text("custom_rules").notNull().default(""),
    allow_communication: boolean("allow_communication").notNull().default(false),
  },
  (t) => [
    check("locations_array", sql`jsonb_typeof(${t.locations}) = 'array'`),
    check("roles_limit", sql`cardinality(${t.roles}) <= 10`),
    check("salary_positive", sql`${t.salary_amount} IS NULL OR ${t.salary_amount} > 0`),
    check(
      "salary_complete",
      sql`(${t.salary_amount} IS NULL AND ${t.salary_currency} IS NULL AND ${t.salary_period} IS NULL) OR (${t.salary_amount} IS NOT NULL AND ${t.salary_currency} IS NOT NULL AND ${t.salary_currency} <> '' AND ${t.salary_period} IS NOT NULL)`,
    ),
  ],
);
export const catalog = pgSchema("catalog");
export const geoCountries = catalog.table(
  "geo_countries",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    regions: jsonb("regions").$type<string[]>().notNull().default([]),
  },
  (t) => [check("geo_country_regions_array", sql`jsonb_typeof(${t.regions}) = 'array'`)],
);
