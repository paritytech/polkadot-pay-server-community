// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";

import type { ListPaymentsInput, PaymentRecord, PaymentStatus } from "./payments.types";

type InsertPaymentRow = {
  id: string;
  merchant_id: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  description: string | null;
  reference: string | null;
  metadata: string;
  display_name: string | null;
  idempotency_key: string | null;
  topic_hex: string;
  deeplink: string;
  privkey_enc: string | null;
  pubkey_hex: string;
  created_at: number;
  expires_at: number;
};

const paymentColumns = `
  id, merchant_id, status, amount, currency, description, reference, metadata,
  display_name, idempotency_key, topic_hex, deeplink, privkey_enc, pubkey_hex,
  coins_enc, coin_count, paid_amount, payer_timestamp_ms,
  anomaly, claim_tx_hash, claim_attempts, claim_last_error, settling_since, claimed_at,
  created_at, expires_at, received_at, completed_at, canceled_at, claim_included_coins, claim_submitted_txs
`;

export async function insertPayment(db: Database, row: InsertPaymentRow): Promise<void> {
  await db.execute(
    `INSERT INTO payments (
      id, merchant_id, status, amount, currency, description, reference, metadata,
      display_name, idempotency_key, topic_hex, deeplink, privkey_enc, pubkey_hex,
      created_at, expires_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16
    )`,
    [
      row.id, row.merchant_id, row.status, row.amount, row.currency, row.description,
      row.reference, row.metadata, row.display_name, row.idempotency_key, row.topic_hex,
      row.deeplink, row.privkey_enc, row.pubkey_hex, row.created_at, row.expires_at,
    ],
  );
}

export async function findPaymentById(db: Database, merchantId: string, paymentId: string): Promise<PaymentRecord | null> {
  return db.queryOne<PaymentRecord>(
    `SELECT ${paymentColumns} FROM payments WHERE merchant_id = $1 AND id = $2 LIMIT 1`,
    [merchantId, paymentId],
  );
}

export async function findPaymentByIdAnyMerchant(db: Database, paymentId: string): Promise<PaymentRecord | null> {
  return db.queryOne<PaymentRecord>(`SELECT ${paymentColumns} FROM payments WHERE id = $1 LIMIT 1`, [paymentId]);
}

export async function findPaymentByTopicHex(db: Database, topic: string): Promise<PaymentRecord | null> {
  return db.queryOne<PaymentRecord>(`SELECT ${paymentColumns} FROM payments WHERE topic_hex = $1 LIMIT 1`, [topic]);
}

export async function findPaymentByIdempotencyKey(
  db: Database,
  merchantId: string,
  idempotencyKey: string,
): Promise<PaymentRecord | null> {
  return db.queryOne<PaymentRecord>(
    `SELECT ${paymentColumns} FROM payments WHERE merchant_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [merchantId, idempotencyKey],
  );
}

export async function listPayments(db: Database, input: ListPaymentsInput): Promise<PaymentRecord[]> {
  const parameters: Array<string | number | null> = [input.merchantId];
  const conditions = ["merchant_id = $1"];

  if (input.status) {
    parameters.push(input.status);
    conditions.push(`status = $${parameters.length}`);
  }
  if (input.createdGte !== undefined) {
    parameters.push(input.createdGte);
    conditions.push(`created_at >= $${parameters.length}`);
  }
  if (input.createdLte !== undefined) {
    parameters.push(input.createdLte);
    conditions.push(`created_at <= $${parameters.length}`);
  }
  if (input.startingAfter) {
    const cursor = await findPaymentById(db, input.merchantId, input.startingAfter);
    if (cursor) {
      parameters.push(cursor.created_at, cursor.created_at, cursor.id);
      const createdParameter = parameters.length - 2;
      const sameCreatedParameter = parameters.length - 1;
      conditions.push(
        `(created_at < $${createdParameter} OR (created_at = $${sameCreatedParameter} AND id < $${parameters.length}))`,
      );
    }
  }

  parameters.push(input.limit + 1);
  return db.query<PaymentRecord>(
    `SELECT ${paymentColumns}
     FROM payments
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT $${parameters.length}`,
    parameters,
  );
}

/**
 * Atomically transitions a payment from `pending` to `received`. Returns false
 * when another delivery of the same cheque already won the transition —
 * statement-store gossip re-delivers cheques, and only the winner may emit
 * `payment.received`.
 */
export async function updatePaymentCompletion(
  db: Database,
  paymentId: string,
  update: {
    status: Extract<PaymentStatus, "received">;
    paid_amount: string;
    coin_count: number;
    payer_timestamp_ms: number;
    coins_enc: string;
    received_at: number;
    privkey_enc: null;
  },
): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET status = $2, paid_amount = $3, coin_count = $4,
       payer_timestamp_ms = $5, coins_enc = $6, received_at = $7,
       privkey_enc = NULL WHERE id = $1 AND status = 'pending'`,
    [paymentId, update.status, update.paid_amount, update.coin_count, update.payer_timestamp_ms,
      update.coins_enc, update.received_at],
  );
  return result.count === 1;
}

/**
 * Compare-and-swap status transition: only applies when the row's current
 * status is one of `expectedStatuses`. Returns false (no-op) when the row has
 * already moved on — e.g. a concurrent settlement completed between the
 * caller's snapshot read and this write.
 */
export async function updatePaymentStatus(
  db: Database,
  paymentId: string,
  status: PaymentStatus,
  expectedStatuses: PaymentStatus[],
  timestampField: "completed_at" | "canceled_at" | null,
  timestamp: number | null,
): Promise<boolean> {
  const updates = ["status = $2"];
  const parameters: Array<string | number | null> = [paymentId, status];
  if (timestampField) {
    updates.push(`${timestampField} = $3`);
    parameters.push(timestamp);
  }
  const statusPlaceholders = expectedStatuses.map((_, index) => `$${parameters.length + index + 1}`);
  parameters.push(...expectedStatuses);
  const result = await db.execute(
    `UPDATE payments SET ${updates.join(", ")} WHERE id = $1 AND status IN (${statusPlaceholders.join(", ")})`,
    parameters,
  );
  return result.count === 1;
}

export async function updatePaymentAnomaly(db: Database, paymentId: string, anomaly: string): Promise<void> {
  await db.execute("UPDATE payments SET anomaly = $2 WHERE id = $1", [paymentId, anomaly]);
}

/**
 * Flips a canceled payment back to `received` when a late cheque delivery
 * completes it after cancellation. Guarded by `status = 'canceled'` so a
 * duplicate delivery of the same cheque — the second of two racing this
 * transition — cannot overwrite a payment the first delivery already moved
 * past `received` (e.g. all the way to `settled`).
 */
export async function storeCanceledPaymentCoins(
  db: Database,
  paymentId: string,
  values: {
    coins_enc: string;
    coin_count: number;
    paid_amount: string;
    payer_timestamp_ms: number;
    anomaly: string;
  },
): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET status = 'received', coins_enc = $2, coin_count = $3,
       paid_amount = $4, payer_timestamp_ms = $5, anomaly = $6,
       privkey_enc = NULL WHERE id = $1 AND status = 'canceled'`,
    [paymentId, values.coins_enc, values.coin_count, values.paid_amount, values.payer_timestamp_ms,
      values.anomaly],
  );
  return result.count === 1;
}

export async function listPaymentsForListening(db: Database, now: number, lateWindowMs: number): Promise<PaymentRecord[]> {
  return db.query<PaymentRecord>(
    `SELECT ${paymentColumns} FROM payments
     WHERE privkey_enc IS NOT NULL AND status IN ('pending', 'expired', 'canceled')
       AND expires_at > $1 ORDER BY created_at ASC`,
    [now - lateWindowMs],
  );
}

export async function listPendingPaymentsPastExpiry(db: Database, now: number): Promise<PaymentRecord[]> {
  return db.query<PaymentRecord>(
    `SELECT ${paymentColumns} FROM payments WHERE status = 'pending' AND expires_at <= $1 ORDER BY expires_at ASC`,
    [now],
  );
}

export async function purgeExpiredPaymentKeys(db: Database, cutoff: number): Promise<void> {
  await db.execute(
    `UPDATE payments SET privkey_enc = NULL
     WHERE privkey_enc IS NOT NULL AND status IN ('expired', 'canceled') AND expires_at <= $1`,
    [cutoff],
  );
}

/**
 * Reclaims a dead worker's lease. A confirming payment may regress only to
 * settling; clearing settling_since parks it for another worker to acquire.
 */
export async function reclaimStalePaymentSettlements(db: Database, staleBefore: number): Promise<number> {
  const result = await db.execute(
    `UPDATE payments SET status = 'settling', settling_since = NULL
     WHERE status IN ('settling','confirming') AND settling_since IS NOT NULL AND settling_since <= $1`,
    [staleBefore],
  );
  return result.count;
}

export async function listUnclaimedPaymentsForSettlement(db: Database, limit: number): Promise<PaymentRecord[]> {
  return db.query<PaymentRecord>(
    `SELECT ${paymentColumns} FROM payments
     WHERE coins_enc IS NOT NULL
       AND (status = 'received' OR (status = 'settling' AND settling_since IS NULL))
     ORDER BY received_at ASC NULLS FIRST, id ASC
     LIMIT $1`,
    [limit],
  );
}

export async function leasePaymentForSettlement(
  db: Database,
  paymentId: string,
  now: number,
): Promise<{ leased: boolean; firstLease: boolean }> {
  const leased = await db.queryOne<{ previous_status: "received" | "settling" }>(
    `WITH candidate AS (
       SELECT id, status FROM payments
       WHERE id = $1 AND (status = 'received' OR (status = 'settling' AND settling_since IS NULL))
       FOR UPDATE
     )
     UPDATE payments AS payment SET status = 'settling', settling_since = $2
     FROM candidate
     WHERE payment.id = candidate.id
     RETURNING candidate.status AS previous_status`,
    [paymentId, now],
  );
  return { leased: leased !== null, firstLease: leased?.previous_status === "received" };
}

export async function markPaymentClaimed(db: Database, paymentId: string, claimTxHash: string | null, now: number): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET status = 'settled', claim_tx_hash = COALESCE(claim_tx_hash, $2),
       claimed_at = COALESCE(claimed_at, $3), claim_last_error = NULL, settling_since = NULL, completed_at = $3
     WHERE id = $1 AND status IN ('settling','confirming') AND coin_count IS NOT NULL
       AND (SELECT count(*) FROM jsonb_object_keys(claim_included_coins)) = coin_count`,
    [paymentId, claimTxHash, now],
  );
  return result.count === 1;
}

export async function markPaymentConfirmingIfComplete(
  db: Database,
  paymentId: string,
  claimTxHash: string | null,
  now: number,
): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET status = 'confirming', claim_tx_hash = COALESCE(claim_tx_hash, $2),
       claimed_at = COALESCE(claimed_at, $3), claim_last_error = NULL
     WHERE id = $1 AND status = 'settling' AND coin_count IS NOT NULL
       AND (SELECT count(*) FROM jsonb_object_keys(claim_included_coins)) = coin_count`,
    [paymentId, claimTxHash, now],
  );
  return result.count === 1;
}

/**
 * Records a coin's submitted claim tx hash: keeps `claim_tx_hash` as the first
 * submitted hash and upserts the per-coin entry so every submission is visible
 * even before (or without) inclusion. A resubmission overwrites the coin's entry.
 */
export async function recordSubmittedClaimTxHash(
  db: Database,
  paymentId: string,
  coinAddress: string,
  claimTxHash: string,
): Promise<void> {
  await db.execute(
    `UPDATE payments SET claim_tx_hash = COALESCE(claim_tx_hash, $3),
       claim_submitted_txs = jsonb_set(claim_submitted_txs, ARRAY[$2], to_jsonb($3::text))
     WHERE id = $1 AND status IN ('settling','confirming')`,
    [paymentId, coinAddress, claimTxHash],
  );
}

/**
 * Heartbeats the settlement lease while coin submissions wait for best-block inclusion.
 */
export async function touchPaymentSettlementLease(db: Database, paymentId: string, now: number): Promise<void> {
  await db.execute(
    `UPDATE payments SET settling_since = $2 WHERE id = $1 AND status IN ('settling','confirming')`,
    [paymentId, now],
  );
}

/**
 * Parking in settling keeps the merchant-visible status monotonic;
 * settling_since = NULL is what makes the row re-leasable.
 */
export async function releasePaymentSettlement(db: Database, paymentId: string, error: string): Promise<void> {
  await db.execute(
    `UPDATE payments SET status = 'settling', settling_since = NULL,
       claim_attempts = claim_attempts + 1, claim_last_error = $2
     WHERE id = $1 AND status IN ('settling','confirming')`,
    [paymentId, error],
  );
}

/**
 * A best-block inclusion drop may demote `confirming` back to `settling` so the
 * aggregate confirmation gate is replayed. `settled` is a terminal state and is
 * never reopened by this function — a late drop signal against an already-settled
 * payment is an operator-reconciliation concern, not a state transition.
 */
export async function reopenConfirmingPayment(db: Database, paymentId: string, error: string): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET status = 'settling', settling_since = NULL, claimed_at = NULL, completed_at = NULL,
       claim_attempts = claim_attempts + 1, claim_last_error = $2
     WHERE id = $1 AND status = 'confirming'`,
    [paymentId, error],
  );
  return result.count === 1;
}

export async function failPaymentSettlement(db: Database, paymentId: string, error: string): Promise<void> {
  await db.execute(
    `UPDATE payments SET status = 'failed', settling_since = NULL, completed_at = $3,
       claim_attempts = claim_attempts + 1, claim_last_error = $2
     WHERE id = $1 AND status IN ('settling','confirming')`,
    [paymentId, error, Date.now()],
  );
}

/**
 * Records that a coin's best-block inclusion was observed for the given txHash.
 * Idempotent — jsonb_set overwrites the address key with the supplied txHash.
 * Status is restricted to settling/confirming: once a payment is settled its
 * claim_included_coins are terminal, so this becomes a silent no-op for late
 * onIncluded / timeout-reconciliation / purse-recovery callbacks.
 */
export async function recordIncludedPaymentCoin(
  db: Database,
  paymentId: string,
  coinAddress: string,
  txHash: string,
): Promise<void> {
  await db.execute(
    `UPDATE payments SET claim_included_coins = jsonb_set(
         claim_included_coins,
         ARRAY[$2::text],
         to_jsonb($3::text),
         true
       )
     WHERE id = $1 AND status IN ('settling','confirming')`,
    [paymentId, coinAddress, txHash],
  );
}

/**
 * Removes a coin's inclusion entry ONLY when the stored txHash for the address
 * matches the supplied dropped txHash. This guards against an old watcher
 * erasing/reopening a newer inclusion that was written by a later attempt.
 * Returns true when a row matched and was removed, false otherwise.
 */
export async function removeIncludedPaymentCoin(
  db: Database,
  paymentId: string,
  coinAddress: string,
  txHash: string,
): Promise<boolean> {
  const result = await db.execute(
    `UPDATE payments SET claim_included_coins = claim_included_coins - $2
     WHERE id = $1
       AND status IN ('settling','confirming')
       AND claim_included_coins ? $2
       AND claim_included_coins ->> $2 = $3`,
    [paymentId, coinAddress, txHash],
  );
  return result.count === 1;
}
