// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { CreditCard } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { Payment } from '../../../types/api';
import { DisplayIf, EmptyState } from '../../../components/ui';
import { cn, formatCurrency, shortId } from '../../../lib/utils';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { paymentStatusNote } from './paymentSettlement';

const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_112px_168px] items-center gap-4';

export function PaymentsTable({ payments }: { payments: Payment[] }) {
  return (
    <div className="overflow-hidden rounded-container bg-surface-container shadow-1">
      <div
        className={cn(
          COLUMNS,
          'border-b border-divider px-4 py-3',
          'text-xs font-semibold uppercase tracking-[0.05em] text-tertiary',
        )}
      >
        <span>Payment</span>
        <span className="text-right">Amount</span>
        <span>Status</span>
      </div>

      {payments.map((payment) => (
        <Link
          key={payment.id}
          to="/payments/$paymentId"
          params={{ paymentId: payment.id }}
          className={cn(
            COLUMNS,
            'border-b border-divider p-4 no-underline',
            'cursor-pointer transition-colors hover:bg-selection-container-hover',
          )}
        >
          <span className="grid min-w-0 gap-1">
            <span className="truncate text-sm font-medium text-primary">{payment.description ?? '—'}</span>
            <code className="truncate text-xs text-tertiary" title={payment.id}>
              {shortId(payment.id)}
            </code>
          </span>
          <span className="grid gap-1 text-right">
            <span className="font-mono text-sm font-medium text-primary">{payment.amount}</span>
            <span className="text-xs text-tertiary">{formatCurrency(payment.currency)}</span>
          </span>
          <span className="grid min-w-0 gap-1">
            <span className="justify-self-start">
              <PaymentStatusBadge payment={payment} />
            </span>
            <span className="truncate text-xs text-tertiary">{paymentStatusNote(payment)}</span>
          </span>
        </Link>
      ))}

      <DisplayIf when={payments.length === 0}>
        <EmptyState icon={CreditCard} title="No payments here" description="Nothing matches this filter yet." />
      </DisplayIf>
    </div>
  );
}
