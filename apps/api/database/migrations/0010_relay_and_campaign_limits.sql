DROP TABLE "users"."agent_relay_messages";--> statement-breakpoint
ALTER TABLE "users"."queued_chat_attachments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users"."applications" DROP COLUMN "submission_reserved";
