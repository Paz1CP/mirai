CREATE TABLE "users"."chat_inbox" (
	"account_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"position" bigint GENERATED ALWAYS AS IDENTITY (sequence name "users"."chat_inbox_position_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payload" jsonb,
	"visible" jsonb,
	"error" text,
	CONSTRAINT "chat_inbox_account_id_chat_id_message_id_pk" PRIMARY KEY("account_id","chat_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "users"."chat_owners" (
	"account_id" text NOT NULL,
	"chat_id" text NOT NULL,
	CONSTRAINT "chat_owners_account_id_chat_id_pk" PRIMARY KEY("account_id","chat_id")
);
--> statement-breakpoint
ALTER TABLE "users"."chat_inbox" ADD CONSTRAINT "chat_inbox_account_id_chat_id_chat_owners_account_id_chat_id_fk" FOREIGN KEY ("account_id","chat_id") REFERENCES "users"."chat_owners"("account_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_inbox_pending_idx" ON "users"."chat_inbox" USING btree ("account_id","chat_id","position") WHERE "users"."chat_inbox"."payload" is not null;