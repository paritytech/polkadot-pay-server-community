// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { config } from "../../env";

import type { PaymentPublic, PaymentRecord } from "./payments.types";

function toIso(timestampMs: number | null): string | null {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function parseMetadata(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

export function paymentUrls(paymentId: string): {
  payment_url: string;
  qr: PaymentPublic["qr"];
} {
  return {
    payment_url: `${config.baseUrl}/pay/${paymentId}`,
    qr: {
      deeplink: `${config.baseUrl}/public/payments/${paymentId}/qr.svg`,
      png: `${config.baseUrl}/public/payments/${paymentId}/qr.png`,
      svg: `${config.baseUrl}/public/payments/${paymentId}/qr.svg`,
    },
  };
}

/**
 * All per-coin claim tx hashes, deduped in insertion order: every submitted
 * hash (`claim_submitted_txs`) plus every inclusion-observed hash
 * (`claim_included_coins`). Reconciliation sentinels (non-0x markers for coins
 * proven absent on chain without an observed inclusion) are excluded.
 */
function claimTxHashes(payment: PaymentRecord): string[] {
  const hashes = [...Object.values(payment.claim_submitted_txs), ...Object.values(payment.claim_included_coins)];
  return [...new Set(hashes)].filter((hash) => hash.startsWith("0x"));
}

export function toPaymentPublic(payment: PaymentRecord): PaymentPublic {
  const urls = paymentUrls(payment.id);
  return {
    id: payment.id,
    object: "payment",
    status: payment.status,
    amount: payment.amount,
    currency: "CASH",
    description: payment.description,
    reference: payment.reference,
    metadata: parseMetadata(payment.metadata),
    display_name: payment.display_name,
    payment_url: urls.payment_url,
    qr: {
      deeplink: payment.deeplink,
      png: urls.qr.png,
      svg: urls.qr.svg,
    },
    settlement: {
      version: 1,
      claim_tx_hash: payment.claim_tx_hash,
      claim_tx_hashes: claimTxHashes(payment),
      claim_last_error: payment.claim_last_error,
      claim_attempts: payment.claim_attempts,
      claim_max_attempts: config.settlement.maxClaimAttempts,
      claimed_at: toIso(payment.claimed_at),
    },
    paid:
      payment.paid_amount && payment.coin_count !== null && payment.payer_timestamp_ms !== null
        ? {
            amount: payment.paid_amount,
            coin_count: payment.coin_count,
            payer_timestamp_ms: payment.payer_timestamp_ms,
          }
        : null,
    created_at: new Date(payment.created_at).toISOString(),
    expires_at: new Date(payment.expires_at).toISOString(),
    received_at: toIso(payment.received_at),
    completed_at: toIso(payment.completed_at),
    canceled_at: toIso(payment.canceled_at),
  };
}

export type PublicPaymentStatus = {
  id: string;
  status: PaymentRecord["status"];
  amount: string;
  currency: "CASH";
  display_name: string | null;
  expires_at: string;
};

export function toPublicPaymentStatus(payment: PaymentRecord): PublicPaymentStatus {
  return {
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    currency: "CASH",
    display_name: payment.display_name,
    expires_at: new Date(payment.expires_at).toISOString(),
  };
}
