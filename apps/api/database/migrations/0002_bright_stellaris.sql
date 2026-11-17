-- Adopt the pre-existing users/catalog resources without recreating or clearing them.
CREATE SCHEMA IF NOT EXISTS "users";
CREATE SCHEMA IF NOT EXISTS "catalog";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users"."candidate_profiles" (
	"account_id" text PRIMARY KEY NOT NULL,
	"cv_url" text,
	"evidence_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"extraction" jsonb,
	"profile" jsonb,
	"confirmed" boolean DEFAULT false NOT NULL,
	"extraction_operation_id" uuid,
	CONSTRAINT "confirmed_profile" CHECK (NOT "users"."candidate_profiles"."confirmed" OR "users"."candidate_profiles"."profile" IS NOT NULL),
	CONSTRAINT "extraction_object" CHECK ("users"."candidate_profiles"."extraction" IS NULL OR jsonb_typeof("users"."candidate_profiles"."extraction") = 'object'),
	CONSTRAINT "profile_object" CHECK ("users"."candidate_profiles"."profile" IS NULL OR jsonb_typeof("users"."candidate_profiles"."profile") = 'object')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "catalog"."geo_countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "geo_country_regions_array" CHECK (jsonb_typeof("catalog"."geo_countries"."regions") = 'array')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users"."job_preferences" (
	"account_id" text PRIMARY KEY NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"roles_required" boolean DEFAULT false NOT NULL,
	"seniority_required" boolean DEFAULT false NOT NULL,
	"industries_required" boolean DEFAULT false NOT NULL,
	"work_modes_required" boolean DEFAULT false NOT NULL,
	"locations_required" boolean DEFAULT false NOT NULL,
	"salary_required" boolean DEFAULT false NOT NULL,
	"schedules_required" boolean DEFAULT false NOT NULL,
	"contracts_required" boolean DEFAULT false NOT NULL,
	"languages_required" boolean DEFAULT false NOT NULL,
	"mobility_required" boolean DEFAULT false NOT NULL,
	"seniorities" "users"."seniority"[] DEFAULT '{}'::users.seniority[] NOT NULL,
	"industries" "users"."industry"[] DEFAULT '{}'::users.industry[] NOT NULL,
	"work_modes" "users"."work_mode"[] DEFAULT '{}'::users.work_mode[] NOT NULL,
	"schedules" "users"."work_schedule"[] DEFAULT '{}'::users.work_schedule[] NOT NULL,
	"contracts" "users"."contract_type"[] DEFAULT '{}'::users.contract_type[] NOT NULL,
	"work_languages" "users"."work_language"[] DEFAULT '{}'::users.work_language[] NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"salary_amount" numeric,
	"salary_currency" text,
	"salary_period" "users"."salary_period",
	"relocation" boolean,
	"visa_sponsorship" boolean,
	"custom_rules" text DEFAULT '' NOT NULL,
	"allow_job_portals" boolean DEFAULT false NOT NULL,
	"allow_portal_messages" boolean DEFAULT false NOT NULL,
	"allow_email" boolean DEFAULT false NOT NULL,
	CONSTRAINT "locations_array" CHECK (jsonb_typeof("users"."job_preferences"."locations") = 'array'),
	CONSTRAINT "roles_limit" CHECK (cardinality("users"."job_preferences"."roles") <= 10),
	CONSTRAINT "salary_positive" CHECK ("users"."job_preferences"."salary_amount" IS NULL OR "users"."job_preferences"."salary_amount" > 0),
	CONSTRAINT "salary_complete" CHECK (("users"."job_preferences"."salary_amount" IS NULL AND "users"."job_preferences"."salary_currency" IS NULL AND "users"."job_preferences"."salary_period" IS NULL) OR ("users"."job_preferences"."salary_amount" IS NOT NULL AND "users"."job_preferences"."salary_currency" IS NOT NULL AND "users"."job_preferences"."salary_currency" <> '' AND "users"."job_preferences"."salary_period" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
 IF to_regclass('users.account_controllers') IS NULL AND to_regclass('public.account_controllers') IS NOT NULL THEN
   ALTER TABLE public.account_controllers SET SCHEMA users;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='users' AND table_name='candidate_profiles' AND column_name='extraction_operation_id') THEN
   ALTER TABLE users.candidate_profiles ADD COLUMN extraction_operation_id uuid;
 END IF;
END $$;
