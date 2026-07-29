ALTER TABLE "payments" ADD COLUMN "claim_submitted_txs" jsonb NOT NULL DEFAULT '{}'::jsonb;
