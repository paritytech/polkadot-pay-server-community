// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { bytesToHex } from "@noble/hashes/utils.js";

import type { MerchantRecord } from "../../types";
import { appError } from "../../lib/errors";
import { seal } from "../../lib/crypto";
import { buildPaymentProcessorDeeplink, MAX_AMOUNT, normalizeAmount } from "./v1/deeplink";
import { paymentId } from "../../lib/ids";
import { generatePaymentKeypair } from "./v1/keys";
import { topicHex } from "./v1/topic";
import type { Database } from "../../db/client";
import { withTransaction } from "../../db/client";
import { toPaymentPublic } from "./payments.public";
import {
  findPaymentById, findPaymentByIdAnyMerchant, findPaymentByIdempotencyKey, findPaymentByTopicHex,
  insertPayment, listPayments, storeCanceledPaymentCoins, updatePaymentAnomaly, updatePaymentCompletion,
  updatePaymentStatus,
} from "./payments.repo";
import type { CreatePaymentInput, ListPaymentsInput, PaymentPublic, PaymentRecord } from "./payments.types";

const DEFAULT_EXPIRES_IN_SECONDS = 900;
const MIN_EXPIRES_IN_SECONDS = 60;
const MAX_EXPIRES_IN_SECONDS = 86_400;
const MAX_METADATA_BYTES = 4 * 1024;

export type PaymentEventType =
  | "payment.created"
  | "payment.received"
  | "payment.settling"
  | "payment.confirming"
  | "payment.settled"
  | "payment.failed"
  | "payment.expired"
  | "payment.canceled";
type PaymentEventHook = (db: Database, type: PaymentEventType, payment: PaymentPublic, record: PaymentRecord) => Promise<void>;
type PaymentSubscriptionHook = (payment: PaymentRecord) => Promise<void>;

export type PaymentsServiceOptions = {
  db: Database;
  onPaymentEvent?: PaymentEventHook;
  onPaymentCreated?: PaymentSubscriptionHook;
  onPaymentChanged?: PaymentSubscriptionHook;
  /** Runs after the receiving transaction commits, so settlement never races an uncommitted row. */
  onPaymentSettleable?: PaymentSubscriptionHook;
};

function metadataString(metadata: Record<string, unknown> | undefined): string {
  const encoded = JSON.stringify(metadata ?? {});
  if (Buffer.byteLength(encoded, "utf8") > MAX_METADATA_BYTES) {
    throw appError(400, "invalid_request_error", "metadata_too_large", "metadata must be 4KB or smaller.", "metadata");
  }
  return encoded;
}

function normalizeExpiresIn(expiresIn: number | undefined): number {
  if (expiresIn === undefined) return DEFAULT_EXPIRES_IN_SECONDS;
  if (!Number.isInteger(expiresIn) || expiresIn < MIN_EXPIRES_IN_SECONDS || expiresIn > MAX_EXPIRES_IN_SECONDS) {
    throw appError(400, "invalid_request_error", "invalid_expires_in", `expires_in must be an integer between ${MIN_EXPIRES_IN_SECONDS} and ${MAX_EXPIRES_IN_SECONDS}.`, "expires_in");
  }
  return expiresIn;
}

function normalizeCreateInput(input: CreatePaymentInput): {
  amount: string; currency: "CASH"; description: string | null; reference: string | null;
  metadata: string; display_name: string | null; expires_in: number;
} {
  let amount: string;
  try { amount = normalizeAmount(input.amount); } catch {
    throw appError(400, "invalid_request_error", "invalid_amount", "Amount must be a decimal with up to two places.", "amount");
  }
  if (Number(amount) <= 0) throw appError(400, "invalid_request_error", "invalid_amount", "Amount must be greater than zero.", "amount");
  if (Number(amount) > MAX_AMOUNT) throw appError(400, "invalid_request_error", "amount_too_large", `Amount must be ${MAX_AMOUNT.toFixed(2)} or less.`, "amount");
  const currency = input.currency ?? "CASH";
  if (currency !== "CASH") throw appError(400, "invalid_request_error", "unsupported_currency", "Only CASH currency is supported in v1.", "currency");
  return { amount, currency, description: input.description ?? null, reference: input.reference ?? null,
    metadata: metadataString(input.metadata), display_name: input.display_name?.trim() || null,
    expires_in: normalizeExpiresIn(input.expires_in) };
}

function coinSecretBytes(coins: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(coins.reduce((size, coin) => size + coin.length, 0));
  let offset = 0;
  for (const coin of coins) { merged.set(coin, offset); offset += coin.length; }
  return merged;
}

export class PaymentsService {
  private readonly db: Database;
  private onPaymentEvent?: PaymentEventHook;
  private onPaymentCreated?: PaymentSubscriptionHook;
  private onPaymentChanged?: PaymentSubscriptionHook;
  private onPaymentSettleable?: PaymentSubscriptionHook;

  constructor({ db, onPaymentEvent, onPaymentCreated, onPaymentChanged, onPaymentSettleable }: PaymentsServiceOptions) {
    this.db = db;
    this.onPaymentEvent = onPaymentEvent;
    this.onPaymentCreated = onPaymentCreated;
    this.onPaymentChanged = onPaymentChanged;
    this.onPaymentSettleable = onPaymentSettleable;
  }

  setHooks(hooks: Omit<PaymentsServiceOptions, "db">): void {
    this.onPaymentEvent = hooks.onPaymentEvent;
    this.onPaymentCreated = hooks.onPaymentCreated;
    this.onPaymentChanged = hooks.onPaymentChanged;
    this.onPaymentSettleable = hooks.onPaymentSettleable;
  }

  async createPayment(merchant: MerchantRecord, input: CreatePaymentInput, idempotencyKey?: string): Promise<PaymentRecord> {
    const normalized = normalizeCreateInput(input);
    if (idempotencyKey) {
      const existing = await findPaymentByIdempotencyKey(this.db, merchant.id, idempotencyKey);
      if (existing) {
        if (existing.amount !== normalized.amount) throw appError(409, "invalid_request_error", "idempotency_conflict", "Idempotency-Key already exists for a different amount.");
        return existing;
      }
    }
    const now = Date.now();
    const id = paymentId();
    const keypair = generatePaymentKeypair();
    const deeplink = buildPaymentProcessorDeeplink({ id, amount: normalized.amount, publicKeyCompressed: keypair.publicKeyCompressed, name: normalized.display_name ?? merchant.name });
    const row: PaymentRecord = { id, merchant_id: merchant.id, status: "pending", amount: normalized.amount, currency: normalized.currency,
      description: normalized.description, reference: normalized.reference, metadata: normalized.metadata, display_name: normalized.display_name,
      idempotency_key: idempotencyKey ?? null, topic_hex: topicHex(id), deeplink, privkey_enc: seal(keypair.privateKey),
      pubkey_hex: bytesToHex(keypair.publicKeyCompressed), coins_enc: null, coin_count: null, paid_amount: null,
      payer_timestamp_ms: null, anomaly: null,
      claim_tx_hash: null, claim_included_coins: {}, claim_submitted_txs: {}, claim_attempts: 0, claim_last_error: null, settling_since: null, claimed_at: null,
      created_at: now, expires_at: now + normalized.expires_in * 1000, received_at: null, completed_at: null, canceled_at: null };
    try {
      await insertPayment(this.db, row);
    } catch (error) {
      if (idempotencyKey) {
        const existing = await findPaymentByIdempotencyKey(this.db, merchant.id, idempotencyKey);
        if (existing) {
          if (existing.amount !== normalized.amount) throw appError(409, "invalid_request_error", "idempotency_conflict", "Idempotency-Key already exists for a different amount.");
          return existing;
        }
      }
      throw error;
    }
    await this.onPaymentEvent?.(this.db, "payment.created", toPaymentPublic(row), row);
    await this.onPaymentCreated?.(row);
    await this.onPaymentChanged?.(row);
    return row;
  }

  async getPayment(merchantId: string, paymentIdValue: string): Promise<PaymentRecord> {
    const payment = await findPaymentById(this.db, merchantId, paymentIdValue);
    if (!payment) throw appError(404, "not_found_error", "payment_not_found", "Payment not found.");
    return payment;
  }

  async getPublicPayment(paymentIdValue: string): Promise<PaymentRecord> {
    const payment = await findPaymentByIdAnyMerchant(this.db, paymentIdValue);
    if (!payment) throw appError(404, "not_found_error", "payment_not_found", "Payment not found.");
    return payment;
  }

  async listPayments(input: ListPaymentsInput): Promise<{ data: PaymentRecord[]; hasMore: boolean }> {
    const rows = await listPayments(this.db, input);
    return { data: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
  }

  async cancelPayment(merchantId: string, paymentIdValue: string): Promise<PaymentRecord> {
    return withTransaction(this.db, async (transaction) => {
      const payment = await findPaymentById(transaction, merchantId, paymentIdValue);
      if (!payment) throw appError(404, "not_found_error", "payment_not_found", "Payment not found.");
      if (payment.status !== "pending") throw appError(400, "invalid_request_error", "payment_not_cancelable", "Only pending payments can be canceled.");
      await updatePaymentStatus(transaction, payment.id, "canceled", "canceled_at", Date.now());
      const updated = await findPaymentById(transaction, merchantId, paymentIdValue);
      if (!updated) throw new Error("Canceled payment disappeared");
      await this.onPaymentEvent?.(transaction, "payment.canceled", toPaymentPublic(updated), updated);
      await this.onPaymentChanged?.(updated);
      return updated;
    });
  }

  async expirePayment(paymentIdValue: string): Promise<PaymentRecord> {
    return withTransaction(this.db, async (transaction) => {
      const payment = await findPaymentByIdAnyMerchant(transaction, paymentIdValue);
      if (!payment) throw appError(404, "not_found_error", "payment_not_found", "Payment not found.");
      if (payment.status !== "pending") return payment;
      await updatePaymentStatus(transaction, payment.id, "expired", null, null);
      const updated = await findPaymentByIdAnyMerchant(transaction, paymentIdValue);
      if (!updated) throw new Error("Expired payment disappeared");
      await this.onPaymentEvent?.(transaction, "payment.expired", toPaymentPublic(updated), updated);
      await this.onPaymentChanged?.(updated);
      return updated;
    });
  }

  async completeFromCheque(paymentIdValue: string, payload: { amount: string; timestamp: bigint; coins: Uint8Array[] }): Promise<PaymentRecord> {
    const result = await withTransaction(this.db, async (transaction) => {
      const payment = await findPaymentByIdAnyMerchant(transaction, paymentIdValue);
      if (!payment) throw appError(404, "not_found_error", "payment_not_found", "Payment not found.");
      if (payment.status === "canceled") return this.storeCanceledCoins(transaction, payment, payload);
      if (payment.status !== "pending") return payment;
      const transitioned = await updatePaymentCompletion(transaction, payment.id, { status: "received", paid_amount: payload.amount,
        coin_count: payload.coins.length, payer_timestamp_ms: Number(payload.timestamp),
        coins_enc: seal(coinSecretBytes(payload.coins)), received_at: Date.now(), privkey_enc: null });
      if (!transitioned) return payment;
      const updated = await findPaymentByIdAnyMerchant(transaction, paymentIdValue);
      if (!updated) throw new Error("Completed payment disappeared");
      await this.onPaymentEvent?.(transaction, "payment.received", toPaymentPublic(updated), updated);
      await this.onPaymentChanged?.(updated);
      return { updated, settleable: true };
    });
    if (!("settleable" in result)) return result;
    await this.onPaymentSettleable?.(result.updated);
    return result.updated;
  }

  async storeAmountMismatch(paymentIdValue: string, amount: string): Promise<void> {
    await updatePaymentAnomaly(this.db, paymentIdValue, `amount_mismatch:${amount}`);
  }

  async findByTopicHex(topic: string): Promise<PaymentRecord | null> {
    return findPaymentByTopicHex(this.db, topic);
  }

  /**
   * Emits a lifecycle event for a payment whose row was already transitioned elsewhere
   * (the settlement claim path updates status through conditional repo writes).
   */
  async emitLifecycleEvent(paymentIdValue: string, type: PaymentEventType): Promise<void> {
    const payment = await findPaymentByIdAnyMerchant(this.db, paymentIdValue);
    if (!payment) return;
    await this.onPaymentEvent?.(this.db, type, toPaymentPublic(payment), payment);
  }

  private async storeCanceledCoins(
    db: Database,
    payment: PaymentRecord,
    payload: { amount: string; timestamp: bigint; coins: Uint8Array[] },
  ): Promise<PaymentRecord> {
    await storeCanceledPaymentCoins(db, payment.id, { coins_enc: seal(coinSecretBytes(payload.coins)), coin_count: payload.coins.length,
      paid_amount: payload.amount, payer_timestamp_ms: Number(payload.timestamp), anomaly: "paid_after_cancel" });
    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    if (!updated) throw new Error("Canceled payment disappeared");
    await this.onPaymentChanged?.(updated);
    return updated;
  }
}
