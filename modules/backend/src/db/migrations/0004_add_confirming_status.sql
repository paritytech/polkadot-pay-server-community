ALTER TABLE "payments" DROP CONSTRAINT "payments_status_check";--> statement-breakpoint
DROP INDEX "idx_payments_settlement";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('pending','received','settling','confirming','settled','expired','canceled','failed'));--> statement-breakpoint
CREATE INDEX "idx_payments_settlement" ON "payments" USING btree ("status") WHERE "payments"."status" IN ('received','settling','confirming');