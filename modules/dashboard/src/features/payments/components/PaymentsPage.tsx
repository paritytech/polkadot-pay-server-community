// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Plus } from 'lucide-react';
import { Button, DisplayIf, EmptyState, PageHeader, Spinner } from '../../../components/ui';
import { paymentsQueryOptions } from '../api/paymentQueries';
import { CreatePaymentPanel } from './CreatePaymentPanel';
import { PaymentStats } from './PaymentStats';
import { PaymentsTable } from './PaymentsTable';
import { PAYMENT_FILTERS, type PaymentFilterKey, isOngoingPayment } from './paymentFilters';

export function PaymentsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterKey, setFilterKey] = useState<PaymentFilterKey>('all');
  const query = useQuery({
    ...paymentsQueryOptions({}),
    refetchInterval: (current) => (current.state.data?.data.some(isOngoingPayment) ? 5000 : false),
  });

  const payments = query.data?.data ?? [];
  const activeFilter = PAYMENT_FILTERS.find((filter) => filter.key === filterKey) ?? PAYMENT_FILTERS[0];
  const isLoaded = !query.isPending && !query.isError;
  const errorText = query.error instanceof Error ? query.error.message : 'Request failed.';

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Payments"
        description="Create payment intents and track them from QR scan through on-chain settlement."
        actions={
          <Button onClick={() => setIsCreateOpen((open) => !open)}>
            <Plus className="h-4 w-4" aria-hidden />
            New payment
          </Button>
        }
      />

      <DisplayIf when={isLoaded}>
        <PaymentStats payments={payments} />
      </DisplayIf>

      <DisplayIf when={isCreateOpen}>
        <CreatePaymentPanel onClose={() => setIsCreateOpen(false)} />
      </DisplayIf>

      <DisplayIf when={query.isPending}>
        <div className="flex min-h-64 items-center justify-center">
          <Spinner />
        </div>
      </DisplayIf>

      <DisplayIf when={query.isError}>
        <EmptyState icon={CreditCard} title="Unable to load payments" description={errorText} />
      </DisplayIf>

      <DisplayIf when={isLoaded}>
        <div className="flex flex-wrap items-center gap-2">
          {PAYMENT_FILTERS.map((filter) => {
            const active = filter.key === filterKey;
            return (
              <Button
                key={filter.key}
                size="sm"
                variant={active ? 'primary' : 'secondary'}
                className="rounded-full"
                aria-pressed={active}
                onClick={() => setFilterKey(filter.key)}
              >
                {filter.label}
                <span className="opacity-[0.65]">{payments.filter(filter.match).length}</span>
              </Button>
            );
          })}
        </div>
      </DisplayIf>

      <DisplayIf when={isLoaded}>
        <PaymentsTable payments={payments.filter(activeFilter.match)} />
      </DisplayIf>
    </div>
  );
}
