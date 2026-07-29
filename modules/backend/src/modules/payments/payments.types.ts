// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export type PaymentStatus = "pending" | "received" | "settling" | "confirming" | "settled" | "expired" | "canceled" | "failed";

export type PaymentRecord = {
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
  coins_enc: string | null;
  coin_count: number | null;
  paid_amount: string | null;
  payer_timestamp_ms: number | null;
  anomaly: string | null;
  claim_tx_hash: string | null;
  claim_attempts: number;
  claim_last_error: string | null;
  settling_since: number | null;
  claimed_at: number | null;
  created_at: number;
  expires_at: number;
  received_at: number | null;
  completed_at: number | null;
  canceled_at: number | null;
  claim_included_coins: Record<string, string>;
  claim_submitted_txs: Record<string, string>;
};

export type PaymentPaid = {
  amount: string;
  coin_count: number;
  payer_timestamp_ms: number;
};

/**
 * Settlement details for the v1 modality: per-coin bearer-coin claims swept
 * on-chain via `Coinage.transfer`. Future modalities (v2+) join the
 * `PaymentSettlement` union with their own `version` tag and fields.
 */
export type PaymentSettlementV1 = {
  version: 1;
  /** First submitted claim tx hash — recorded pre-inclusion, purely informational. */
  claim_tx_hash: string | null;
  /** Per-coin claim tx hashes observed at inclusion, deduped; a multi-coin payment settles across several txs. */
  claim_tx_hashes: string[];
  claim_last_error: string | null;
  claim_attempts: number;
  claim_max_attempts: number;
  claimed_at: string | null;
};

export type PaymentSettlement = PaymentSettlementV1;

export type PaymentPublic = {
  id: string;
  object: "payment";
  status: PaymentStatus;
  amount: string;
  currency: "CASH";
  description: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  display_name: string | null;
  payment_url: string;
  qr: {
    deeplink: string;
    png: string;
    svg: string;
  };
  /** Versioned settlement details; `version` discriminates the modality. */
  settlement: PaymentSettlement;
  paid: PaymentPaid | null;
  created_at: string;
  expires_at: string;
  received_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
};

export type CreatePaymentInput = {
  amount: string;
  currency?: string;
  description?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown>;
  display_name?: string | null;
  expires_in?: number;
};

export type ListPaymentsInput = {
  merchantId: string;
  status?: PaymentStatus;
  limit: number;
  startingAfter?: string;
  createdGte?: number;
  createdLte?: number;
};
