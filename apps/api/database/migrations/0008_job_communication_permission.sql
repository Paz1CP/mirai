ALTER TABLE "users"."job_preferences" ADD COLUMN "allow_communication" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users"."job_preferences" DROP COLUMN "allow_job_portals";--> statement-breakpoint
ALTER TABLE "users"."job_preferences" DROP COLUMN "allow_portal_messages";--> statement-breakpoint
ALTER TABLE "users"."job_preferences" DROP COLUMN "allow_email";