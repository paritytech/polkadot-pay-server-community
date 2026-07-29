// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment, PaymentStatus } from '../../../types/api';

/** Plain-English gloss shown under the status pill in rows and on the detail header. */
export const PAYMENT_STATUS_NOTE: Record<PaymentStatus, string> = {
  pending: 'awaiting scan',
  received: 'funds seen on chain',
  settling: 'claiming to operator',
  confirming: 'in a block, awaiting final confirmation',
  settled: 'claimed',
  expired: 'never scanned',
  canceled: 'canceled by you',
  failed: 'claim failed',
};

export type SettlementState =
  | { kind: 'none' }
  | { kind: 'retrying'; attempt: number; maxAttempts: number; message: string }
  | { kind: 'failed'; attempt: number; maxAttempts: number; message: string };

const FALLBACK_MESSAGE = 'settlement failed';
const NON_RETRYING_STATUSES: Payment['status'][] = ['settled', 'canceled', 'expired'];

/** Classifies a payment so the UI can show either a retrying or final-failed notice. */
export function settlementState(payment: Payment): SettlementState {
  const message = payment.settlement.claim_last_error ?? '';
  const attempt = payment.settlement.claim_attempts;
  const maxAttempts = payment.settlement.claim_max_attempts;

  if (payment.status === 'failed') {
    return { kind: 'failed', attempt, maxAttempts, message: message || FALLBACK_MESSAGE };
  }

  if (message && !NON_RETRYING_STATUSES.includes(payment.status)) {
    return { kind: 'retrying', attempt, maxAttempts, message };
  }

  return { kind: 'none' };
}

/**
 * Status gloss shown under the badge. A payment parked between claim attempts stays `settling`
 * with its lease released, so the retry counter is the only signal that settlement stumbled.
 */
export function paymentStatusNote(payment: Payment): string {
  const state = settlementState(payment);
  if (state.kind === 'retrying') return `retrying claim (${state.attempt}/${state.maxAttempts})`;
  return PAYMENT_STATUS_NOTE[payment.status];
}
