// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment } from '../../../types/api';

export type PaymentFilterKey = 'all' | 'ongoing' | 'settled' | 'expired' | 'failed';

export interface PaymentFilter {
  key: PaymentFilterKey;
  label: string;
  match: (payment: Payment) => boolean;
}

/** A payment still moving through scan → settlement → on-chain confirmation. Drives the Ongoing stat, filter, and nav count. */
export function isOngoingPayment(payment: Payment): boolean {
  return (
    payment.status === 'pending' ||
    payment.status === 'received' ||
    payment.status === 'settling' ||
    payment.status === 'confirming'
  );
}

export const PAYMENT_FILTERS: PaymentFilter[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'ongoing', label: 'Ongoing', match: isOngoingPayment },
  { key: 'settled', label: 'Settled', match: (payment) => payment.status === 'settled' },
  {
    key: 'expired',
    label: 'Expired',
    match: (payment) => payment.status === 'expired' || payment.status === 'canceled',
  },
  { key: 'failed', label: 'Failed', match: (payment) => payment.status === 'failed' },
];
