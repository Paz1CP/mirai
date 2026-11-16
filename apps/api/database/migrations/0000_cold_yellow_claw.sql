CREATE TABLE "account_controllers" (
	"account_id" text PRIMARY KEY NOT NULL,
	"instance_id" uuid NOT NULL,
	"epoch" bigint DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "controller_epoch_positive" CHECK ("account_controllers"."epoch" > 0)
);
--> statement-breakpoint
CREATE TABLE "extension_challenges" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"epoch" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"epoch" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "linked_extensions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "extension_challenges" ADD CONSTRAINT "extension_challenges_account_id_account_controllers_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_controllers"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_extensions" ADD CONSTRAINT "linked_extensions_account_id_account_controllers_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_controllers"("account_id") ON DELETE cascade ON UPDATE no action;