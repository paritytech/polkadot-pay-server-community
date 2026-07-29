// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Link } from '@tanstack/react-router';
import { CreditCard } from 'lucide-react';
import type { Payment } from '../../../types/api';
import { EmptyState } from '../../../components/ui';
import { formatDateTime, shortId } from '../../../lib/utils';
import { PaymentStatusBadge } from '../../payments/components/PaymentStatusBadge';

export function RecentPayments({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) {
    return <EmptyState icon={CreditCard} title="No payments yet" description="Create a payment to begin tracking activity." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <caption className="sr-only">Five most recent payments</caption>
        <thead>
          <tr className="border-b border-divider">
            <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-tertiary">Payment</th>
            <th className="px-4 pb-3 text-left text-xs font-semibold uppercase tracking-wide text-tertiary">Status</th>
            <th className="px-4 pb-3 text-right text-xs font-semibold uppercase tracking-wide text-tertiary">Amount</th>
            <th className="pb-3 pl-4 text-right text-xs font-semibold uppercase tracking-wide text-tertiary">Created</th>
          </tr>
        </thead>
        <tbody>
          {payments.slice(0, 5).map((payment) => (
            <tr key={payment.id} className="border-b border-divider last:border-0">
              <td className="py-3 pr-4">
                <Link to="/payments/$paymentId" params={{ paymentId: payment.id }} className="font-mono text-sm text-link hover:text-link-hover">
                  {shortId(payment.id, 8, 4)}
                </Link>
                <p className="mt-0.5 max-w-52 truncate text-xs text-secondary">{payment.description ?? 'No description'}</p>
              </td>
              <td className="px-4 py-3"><PaymentStatusBadge payment={payment} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums text-primary">
                {formatAmount(payment.amount, payment.currency)}
              </td>
              <td className="whitespace-nowrap py-3 pl-4 text-right text-xs text-secondary">{formatDateTime(payment.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatAmount(amount: string, currency: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(parsed)} ${currency}`;
}
