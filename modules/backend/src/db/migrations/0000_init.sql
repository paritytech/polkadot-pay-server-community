CREATE TABLE IF NOT EXISTS "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"last4" text NOT NULL,
	"label" text,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" text NOT NULL,
	"payment_id" text,
	"payload" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'CASH' NOT NULL,
	"description" text,
	"reference" text,
	"metadata" text DEFAULT '{}' NOT NULL,
	"display_name" text,
	"idempotency_key" text,
	"topic_hex" text NOT NULL,
	"deeplink" text NOT NULL,
	"privkey_enc" text,
	"pubkey_hex" text NOT NULL,
	"coins_enc" text,
	"coin_count" integer,
	"paid_amount" text,
	"payer_timestamp_ms" bigint,
	"settlement_status" text DEFAULT 'none' NOT NULL,
	"anomaly" text,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"completed_at" bigint,
	"canceled_at" bigint,
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('pending','completed','expired','canceled')),
	CONSTRAINT "payments_settlement_status_check" CHECK ("payments"."settlement_status" IN ('none','unclaimed','exported','claimed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"url" text NOT NULL,
	"events" text DEFAULT '["*"]' NOT NULL,
	"secret_enc" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"created_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" bigint NOT NULL,
	"last_status_code" integer,
	"last_error" text,
	"delivered_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "webhook_deliveries_status_check" CHECK ("webhook_deliveries"."status" IN ('pending','succeeded','failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_merchant_id_fkey" TO "api_keys_merchant_id_merchants_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" RENAME CONSTRAINT "payments_merchant_id_fkey" TO "payments_merchant_id_merchants_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_endpoints" RENAME CONSTRAINT "webhook_endpoints_merchant_id_fkey" TO "webhook_endpoints_merchant_id_merchants_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" RENAME CONSTRAINT "webhook_deliveries_event_id_fkey" TO "webhook_deliveries_event_id_events_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" RENAME CONSTRAINT "webhook_deliveries_endpoint_id_fkey" TO "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" RENAME CONSTRAINT "api_keys_key_hash_key" TO "api_keys_key_hash_unique";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
    WHERE conname = 'api_keys_key_hash_unique'
      AND conrelid = 'api_keys'::regclass
 ) THEN
   ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash");
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" RENAME CONSTRAINT "payments_topic_hex_key" TO "payments_topic_hex_unique";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_topic_hex_unique'
      AND conrelid = 'payments'::regclass
 ) THEN
   ALTER TABLE "payments" ADD CONSTRAINT "payments_topic_hex_unique" UNIQUE("topic_hex");
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_list" ON "events" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payments_idem" ON "payments" USING btree ("merchant_id","idempotency_key") WHERE "payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_list" ON "payments" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_pending" ON "payments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveries_due" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
DROP TABLE IF EXISTS "schema_version";
