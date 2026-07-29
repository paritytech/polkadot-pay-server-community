ALTER TABLE "payments" ADD COLUMN "claim_included_coins" jsonb NOT NULL DEFAULT '{}'::jsonb;
