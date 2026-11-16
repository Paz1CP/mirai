ALTER TABLE "extension_challenges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "linked_extensions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "extension_challenges" CASCADE;--> statement-breakpoint
DROP TABLE "linked_extensions" CASCADE;--> statement-breakpoint
ALTER TABLE "account_controllers" DROP CONSTRAINT "controller_epoch_positive";--> statement-breakpoint
ALTER TABLE "account_controllers" DROP COLUMN "epoch";--> statement-breakpoint
ALTER TABLE "account_controllers" DROP COLUMN "expires_at";