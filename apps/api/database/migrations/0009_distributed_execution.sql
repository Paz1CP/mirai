CREATE TABLE "users"."agent_relay_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users"."browser_routes" (
	"account_id" text PRIMARY KEY NOT NULL,
	"instance_id" uuid NOT NULL,
	"socket_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users"."browser_tickets" (
	"digest" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users"."queued_chat_attachments" (
	"account_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"data" text NOT NULL,
	CONSTRAINT "queued_chat_attachments_account_id_chat_id_message_id_position_pk" PRIMARY KEY("account_id","chat_id","message_id","position")
);
--> statement-breakpoint
ALTER TABLE "users"."applications" ADD COLUMN "submission_reserved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_relay_expiry" ON "users"."agent_relay_messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "browser_ticket_expiry" ON "users"."browser_tickets" USING btree ("expires_at");