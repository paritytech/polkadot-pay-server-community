ALTER TABLE "payments" DROP CONSTRAINT "payments_status_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_settlement_status_check";--> statement-breakpoint
DROP INDEX "idx_payments_settlement";--> statement-breakpoint
UPDATE "payments"
SET status = CASE
  WHEN status = 'completed' AND settlement_status IN ('unclaimed', 'exported') THEN 'received'
  WHEN status = 'completed' AND settlement_status = 'settling' THEN 'settling'
  WHEN status = 'completed' AND settlement_status = 'claimed' THEN 'settled'
  WHEN status = 'completed' AND settlement_status = 'failed' THEN 'failed'
  WHEN status = 'canceled' AND settlement_status = 'unclaimed' THEN 'received'
  ELSE status
END
WHERE (status = 'completed' AND settlement_status IN ('unclaimed', 'exported', 'settling', 'claimed', 'failed'))
   OR (status = 'canceled' AND settlement_status = 'unclaimed');--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "settlement_status";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('pending','received','settling','settled','expired','canceled','failed'));--> statement-breakpoint
CREATE INDEX "idx_payments_settlement" ON "payments" USING btree ("status") WHERE "payments"."status" IN ('received','settling');
