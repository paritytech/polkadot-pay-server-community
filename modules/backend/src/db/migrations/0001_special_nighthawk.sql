ALTER TABLE "payments" DROP CONSTRAINT "payments_settlement_status_check";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_tx_hash" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_last_error" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "settling_since" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claimed_at" bigint;--> statement-breakpoint
CREATE INDEX "idx_payments_settlement" ON "payments" USING btree ("settlement_status") WHERE "payments"."settlement_status" IN ('unclaimed','settling');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_settlement_status_check" CHECK ("payments"."settlement_status" IN ('none','unclaimed','exported','claimed','settling','failed'));