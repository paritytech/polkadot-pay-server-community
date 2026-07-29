// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Badge, type BadgeTone } from '../../../components/ui';
import type { Payment, PaymentStatus } from '../../../types/api';
import { settlementState } from './paymentSettlement';

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: 'pending',
  received: 'success',
  settling: 'pending',
  confirming: 'pending',
  settled: 'success',
  expired: 'neutral',
  canceled: 'error',
  failed: 'error',
};

/**
 * A payment mid-retry (settlement stumbled but hasn't exhausted its attempts) stays parked at
 * `settling`, so the raw status alone would read as ordinary progress even though it may take
 * several more attempts to actually settle.
 */
export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  const tone = settlementState(payment).kind === 'retrying' ? 'warning' : STATUS_TONE[payment.status];
  return <Badge tone={tone}>{payment.status}</Badge>;
}
