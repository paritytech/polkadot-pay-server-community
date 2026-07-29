// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment, PaymentStatus } from '../../../types/api';

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending', received: 'Received', settling: 'Settling', confirming: 'Confirming', settled: 'Settled',
  expired: 'Expired', canceled: 'Canceled', failed: 'Failed',
};
const STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: 'bg-warning', received: 'bg-link', settling: 'bg-link', confirming: 'bg-link', settled: 'bg-success',
  expired: 'bg-tertiary', canceled: 'bg-tertiary', failed: 'bg-error',
};

export function PaymentStatusBreakdown({ payments }: { payments: Payment[] }) {
  const counts = payments.reduce<Partial<Record<PaymentStatus, number>>>((result, payment) => {
    result[payment.status] = (result[payment.status] ?? 0) + 1;
    return result;
  }, {});
  const entries = Object.entries(counts) as Array<[PaymentStatus, number]>;
  const total = payments.length;

  if (total === 0) return <p className="py-8 text-center text-sm text-secondary">No payment status data yet.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-nested" aria-hidden>
        {entries.map(([status, count]) => (
          <span key={status} className={STATUS_COLORS[status]} style={{ width: `${(count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-2" aria-label="Payment status counts">
        {entries.map(([status, count]) => (
          <li key={status} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-secondary">
              <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} aria-hidden />
              {STATUS_LABELS[status]}
            </span>
            <span className="font-medium tabular-nums text-primary">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
