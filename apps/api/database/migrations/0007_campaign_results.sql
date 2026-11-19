CREATE TABLE "users"."applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"job_title" text NOT NULL,
	"job_url" text NOT NULL,
	"platform" text,
	"location" text,
	"status" text NOT NULL,
	"status_reason" text,
	"document_refs" jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_status" CHECK ("users"."applications"."status" IN ('confirmed','unconfirmed','pending_review','failed','skipped')),
	CONSTRAINT "applications_document_refs_array" CHECK (jsonb_typeof("users"."applications"."document_refs") = 'array'),
	CONSTRAINT "applications_explain_outcome" CHECK ("users"."applications"."status" IN ('confirmed','skipped') OR nullif(trim("users"."applications"."status_reason"), '') IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "users"."campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"chat_session_id" text NOT NULL,
	"title" text NOT NULL,
	"mandate" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"max_applications" integer,
	"status" text NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "campaigns_account_id_unique" UNIQUE("account_id","id"),
	CONSTRAINT "campaigns_status" CHECK ("users"."campaigns"."status" IN ('running','stopped','completed','failed')),
	CONSTRAINT "campaigns_max_applications" CHECK ("users"."campaigns"."max_applications" > 0),
	CONSTRAINT "campaigns_criteria_object" CHECK (jsonb_typeof("users"."campaigns"."criteria") = 'object')
);
--> statement-breakpoint
ALTER TABLE "users"."applications" ADD CONSTRAINT "applications_campaign_account_fk" FOREIGN KEY ("account_id","campaign_id") REFERENCES "users"."campaigns"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_account_updated" ON "users"."applications" USING btree ("account_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "applications_account_campaign_updated" ON "users"."applications" USING btree ("account_id","campaign_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "applications_account_status_updated" ON "users"."applications" USING btree ("account_id","status","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "campaigns_account_updated" ON "users"."campaigns" USING btree ("account_id","updated_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "campaigns_account_chat_updated" ON "users"."campaigns" USING btree ("account_id","chat_session_id","updated_at" DESC NULLS LAST);