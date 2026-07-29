// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const TIMESTAMP = (name: string) =>
  bigint(name, { mode: "number" });

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: TIMESTAMP("created_at").notNull(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    keyHash: text("key_hash").notNull().unique(),
    last4: text("last4").notNull(),
    label: text("label"),
    createdAt: TIMESTAMP("created_at").notNull(),
    revokedAt: TIMESTAMP("revoked_at"),
  },
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    status: text("status").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("CASH"),
    description: text("description"),
    reference: text("reference"),
    metadata: text("metadata").notNull().default("{}"),
    displayName: text("display_name"),
    idempotencyKey: text("idempotency_key"),
    topicHex: text("topic_hex").notNull().unique(),
    deeplink: text("deeplink").notNull(),
    privkeyEnc: text("privkey_enc"),
    pubkeyHex: text("pubkey_hex").notNull(),
    coinsEnc: text("coins_enc"),
    coinCount: integer("coin_count"),
    paidAmount: text("paid_amount"),
    payerTimestampMs: TIMESTAMP("payer_timestamp_ms"),
    anomaly: text("anomaly"),
    claimTxHash: text("claim_tx_hash"),
    claimAttempts: integer("claim_attempts").notNull().default(0),
    claimLastError: text("claim_last_error"),
    settlingSince: TIMESTAMP("settling_since"),
    claimedAt: TIMESTAMP("claimed_at"),
    createdAt: TIMESTAMP("created_at").notNull(),
    expiresAt: TIMESTAMP("expires_at").notNull(),
    receivedAt: TIMESTAMP("received_at"),
    completedAt: TIMESTAMP("completed_at"),
    canceledAt: TIMESTAMP("canceled_at"),
    claimIncludedCoins: jsonb("claim_included_coins").notNull().default(sql`'{}'::jsonb`),
    claimSubmittedTxs: jsonb("claim_submitted_txs").notNull().default(sql`'{}'::jsonb`),
   },
   (table) => [
    check("payments_status_check", sql`${table.status} IN ('pending','received','settling','confirming','settled','expired','canceled','failed')`),
    uniqueIndex("idx_payments_idem")
      .on(table.merchantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index("idx_payments_list").on(table.merchantId, table.createdAt.desc()),
    index("idx_payments_pending").on(table.status, table.expiresAt),
    index("idx_payments_settlement")
      .on(table.status)
      .where(sql`${table.status} IN ('received','settling','confirming')`),
  ],
);

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id")
    .notNull()
    .references(() => merchants.id),
  url: text("url").notNull(),
  events: text("events").notNull().default('["*"]'),
  secretEnc: text("secret_enc").notNull(),
  status: text("status").notNull().default("enabled"),
  createdAt: TIMESTAMP("created_at").notNull(),
  deletedAt: TIMESTAMP("deleted_at"),
});

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    type: text("type").notNull(),
    paymentId: text("payment_id"),
    payload: text("payload").notNull(),
    createdAt: TIMESTAMP("created_at").notNull(),
  },
  (table) => [index("idx_events_list").on(table.merchantId, table.createdAt.desc())],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: TIMESTAMP("next_attempt_at").notNull(),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    deliveredAt: TIMESTAMP("delivered_at"),
    createdAt: TIMESTAMP("created_at").notNull(),
  },
  (table) => [
    check(
      "webhook_deliveries_status_check",
      sql`${table.status} IN ('pending','succeeded','failed')`,
    ),
    index("idx_deliveries_due").on(table.status, table.nextAttemptAt),
  ],
);
