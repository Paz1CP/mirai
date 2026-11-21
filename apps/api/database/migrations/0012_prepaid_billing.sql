CREATE SCHEMA IF NOT EXISTS "billing";
--> statement-breakpoint
CREATE TABLE "billing"."ledger" (
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"movement_key" text NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"details" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_id_environment_movement_key_pk" PRIMARY KEY("account_id","environment","movement_key"),
	CONSTRAINT "ledger_amount" CHECK (
      ("billing"."ledger"."kind" = 'purchase' and "billing"."ledger"."amount" > 0)
      or ("billing"."ledger"."kind" in ('usage','expiration','refund','chargeback') and "billing"."ledger"."amount" <= 0)
      or ("billing"."ledger"."kind" in ('event','inference_pending','inference_released') and "billing"."ledger"."amount" = 0)
    )
);
--> statement-breakpoint
CREATE TABLE "billing"."topups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"transaction_id" text,
	"package_usd" integer NOT NULL,
	"price_id" text NOT NULL,
	"product_id" text NOT NULL,
	"nominal" bigint NOT NULL,
	"remaining" bigint DEFAULT 0 NOT NULL,
	"revoked" bigint DEFAULT 0 NOT NULL,
	"purchased_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"payment_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topups_environment_transaction_id_unique" UNIQUE("environment","transaction_id"),
	CONSTRAINT "topup_amount" CHECK ("billing"."topups"."package_usd" in (10,25,50,100)
      and "billing"."topups"."nominal" = "billing"."topups"."package_usd"::bigint * 1000000000000
      and "billing"."topups"."remaining" >= 0 and "billing"."topups"."revoked" >= 0
      and "billing"."topups"."remaining" + "billing"."topups"."revoked" <= "billing"."topups"."nominal"),
	CONSTRAINT "topup_expiry" CHECK (("billing"."topups"."purchased_at" is null and "billing"."topups"."expires_at" is null and "billing"."topups"."remaining" = 0)
      or ("billing"."topups"."transaction_id" is not null and "billing"."topups"."purchased_at" is not null and "billing"."topups"."expires_at" is not null
      and "billing"."topups"."expires_at" = "billing"."topups"."purchased_at" + interval '720 hours'))
);
--> statement-breakpoint
CREATE TABLE "billing"."wallets" (
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	CONSTRAINT "wallets_account_id_environment_pk" PRIMARY KEY("account_id","environment"),
	CONSTRAINT "wallet_environment" CHECK ("billing"."wallets"."environment" in ('sandbox', 'live'))
);
--> statement-breakpoint
ALTER TABLE "billing"."ledger" ADD CONSTRAINT "ledger_account_id_environment_wallets_account_id_environment_fk" FOREIGN KEY ("account_id","environment") REFERENCES "billing"."wallets"("account_id","environment") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."topups" ADD CONSTRAINT "topups_account_id_environment_wallets_account_id_environment_fk" FOREIGN KEY ("account_id","environment") REFERENCES "billing"."wallets"("account_id","environment") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_history" ON "billing"."ledger" USING btree ("account_id","environment","at" DESC NULLS LAST,"movement_key");--> statement-breakpoint
CREATE INDEX "ledger_pending" ON "billing"."ledger" USING btree ("account_id","environment") WHERE "billing"."ledger"."kind" = 'inference_pending';--> statement-breakpoint
CREATE INDEX "topups_spend_order" ON "billing"."topups" USING btree ("account_id","environment","expires_at","id");
