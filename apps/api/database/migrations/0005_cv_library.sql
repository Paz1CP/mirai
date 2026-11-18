CREATE TABLE "users"."cv_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"specialization" text DEFAULT '' NOT NULL,
	"profile" jsonb,
	"source_key" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"last_replacement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cv_metadata_length" CHECK (length(trim("users"."cv_documents"."name")) BETWEEN 1 AND 120 AND length("users"."cv_documents"."specialization") <= 120),
	CONSTRAINT "cv_valid_kind_content" CHECK (("users"."cv_documents"."kind" = 'primary' AND "users"."cv_documents"."profile" IS NULL AND "users"."cv_documents"."source_key" IS NULL AND NOT "users"."cv_documents"."is_default")
        OR ("users"."cv_documents"."kind" = 'variant' AND "users"."cv_documents"."profile" IS NOT NULL AND jsonb_typeof("users"."cv_documents"."profile") = 'object' AND "users"."cv_documents"."last_replacement_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users"."document_cleanup" (
	"key" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users"."candidate_profiles" ADD COLUMN "revision" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users"."candidate_profiles" ADD COLUMN "profile_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users"."cv_documents" ADD CONSTRAINT "cv_documents_account_id_candidate_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "users"."candidate_profiles"("account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_documents_account_updated" ON "users"."cv_documents" USING btree ("account_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "cv_one_primary" ON "users"."cv_documents" USING btree ("account_id") WHERE "users"."cv_documents"."kind" = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX "cv_one_default" ON "users"."cv_documents" USING btree ("account_id") WHERE "users"."cv_documents"."is_default";--> statement-breakpoint
CREATE INDEX "document_cleanup_account_due" ON "users"."document_cleanup" USING btree ("account_id","due_at");
--> statement-breakpoint
INSERT INTO "users"."cv_documents" ("account_id", "kind", "name")
SELECT "account_id", 'primary', 'CV'
FROM "users"."candidate_profiles"
WHERE "profile" IS NOT NULL
ON CONFLICT DO NOTHING;
