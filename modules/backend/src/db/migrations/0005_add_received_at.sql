ALTER TABLE "payments" ADD COLUMN "received_at" bigint;--> statement-breakpoint
UPDATE "payments" SET "received_at" = "completed_at" WHERE "completed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "payments" SET "completed_at" = "claimed_at" WHERE "status" = 'settled';--> statement-breakpoint
UPDATE "payments" SET "completed_at" = NULL WHERE "status" IN ('received', 'settling', 'confirming');
