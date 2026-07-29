// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment } from '../../../types/api';
import { formatCurrency } from '../../../lib/utils';
import { isOngoingPayment } from './paymentFilters';
import { settlementState } from './paymentSettlement';

function settledToday(payments: Payment[]): Payment[] {
  const now = new Date();
  return payments.filter((payment) => {
    if (payment.status !== 'settled') return false;
    const claimedAt = payment.completed_at ?? payment.settlement.claimed_at;
    if (!claimedAt) return false;
    const date = new Date(claimedAt);
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  });
}

/** A payment awaiting a settlement retry stays parked at `settling`, so it must be counted separately from a final failure. */
function attentionNote(failedCount: number, retryingCount: number): string {
  const parts: string[] = [];
  if (failedCount > 0) parts.push(`${failedCount} failed`);
  if (retryingCount > 0) parts.push(`${retryingCount} retrying settlement`);
  return parts.length === 0 ? 'nothing failing' : parts.join(', ');
}

export function PaymentStats({ payments }: { payments: Payment[] }) {
  const ongoing = payments.filter(isOngoingPayment).length;
  const settled = settledToday(payments);
  const settledVolume = settled.reduce((sum, payment) => sum + (Number.parseFloat(payment.amount) || 0), 0);
  const failedCount = payments.filter((payment) => payment.status === 'failed').length;
  const retryingCount = payments.filter((payment) => settlementState(payment).kind === 'retrying').length;
  const needsAttention = failedCount + retryingCount;
  const settledTotal = payments.filter((payment) => payment.status === 'settled').length;
  const finishedTotal = payments.filter((payment) =>
    ['settled', 'expired', 'canceled', 'failed'].includes(payment.status),
  ).length;
  const successRate = finishedTotal === 0 ? null : (settledTotal / finishedTotal) * 100;

  const stats = [
    {
      label: 'Ongoing',
      value: String(ongoing),
      unit: ongoing === 1 ? 'payment' : 'payments',
      note: 'awaiting scan or settlement',
    },
    {
      label: 'Settled today',
      value: settledVolume.toFixed(2),
      unit: formatCurrency('CASH'),
      note: `${settled.length} payment${settled.length === 1 ? '' : 's'} claimed`,
    },
    {
      label: 'Success rate',
      value: successRate === null ? '—' : successRate.toFixed(0),
      unit: successRate === null ? '' : '%',
      note: `${settledTotal} of ${finishedTotal} finished payments settled`,
    },
    {
      label: 'Needs attention',
      value: String(needsAttention),
      unit: needsAttention === 1 ? 'payment' : 'payments',
      note: attentionNote(failedCount, retryingCount),
    },
  ];

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(184px,1fr))]">
      {stats.map((stat) => (
        <div key={stat.label} className="grid gap-2 rounded-container bg-surface-container p-5 shadow-1">
          <span className="text-sm font-medium text-secondary">{stat.label}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[28px] leading-none text-primary">{stat.value}</span>
            <span className="text-xs text-tertiary">{stat.unit}</span>
          </div>
          <span className="text-xs text-tertiary">{stat.note}</span>
        </div>
      ))}
    </div>
  );
}
