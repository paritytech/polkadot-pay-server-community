// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, CreditCard } from 'lucide-react';
import { ApiError } from '../../../lib/apiClient';
import { formatCurrency } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { Button, DisplayIf, EmptyState, Spinner } from '../../../components/ui';
import { cancelPayment, paymentQueryOptions } from '../api/paymentQueries';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { PaymentDetailsCard, PaymentPaidCard, PaymentSettlementNotice } from './PaymentFacts';
import { PaymentLifecycle } from './PaymentLifecycle';
import { isOngoingPayment } from './paymentFilters';
import { paymentStatusNote } from './paymentSettlement';
import { QrPanel } from './QrPanel';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.param ? `${error.param}: ${error.message}` : error.message;
  if (error instanceof Error) return error.message;
  return 'Request failed.';
}

function BackLink() {
  return (
    <Link
      to="/payments"
      className="inline-flex cursor-pointer items-center gap-2 justify-self-start text-sm font-medium text-link transition-colors hover:text-link-hover"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
      Back to payments
    </Link>
  );
}

export function PaymentDetailPage({ paymentId }: { paymentId: string }) {
  const queryClient = useQueryClient();
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const query = useQuery({
    ...paymentQueryOptions(paymentId),
    refetchInterval: (current) => {
      const payment = current.state.data;
      return payment && isOngoingPayment(payment) ? 800 : false;
    },
  });
  const payment = query.data;
  const previousStatus = useRef(payment?.status);
  useEffect(() => {
    if (payment && previousStatus.current === 'pending' && payment.status === 'received') {
      toast({ title: 'Payment received', tone: 'success' });
    }
    previousStatus.current = payment?.status;
  }, [payment]);

  const cancelMutation = useMutation({
    mutationFn: cancelPayment,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment', paymentId] });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsConfirmingCancel(false);
      toast({ title: 'Payment canceled', tone: 'success' });
    },
    onError: (error) => {
      toast({ title: errorMessage(error), tone: 'error' });
    },
  });

  if (query.isPending) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!payment) {
    const isNotFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="grid gap-6">
        <BackLink />
        <DisplayIf when={isNotFound}>
          <EmptyState icon={CreditCard} title="Payment not found" />
        </DisplayIf>
        <DisplayIf falsy={isNotFound}>
          <EmptyState
            icon={CreditCard}
            title="Unable to load payment"
            description={errorMessage(query.error)}
          />
        </DisplayIf>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-baseline gap-2.5">
            <span className="font-display text-[40px] font-normal leading-none text-primary">
              {payment.amount}
            </span>
            <span className="text-sm font-semibold text-tertiary">{formatCurrency(payment.currency)}</span>
          </h1>
          <p className="mt-2 text-sm text-secondary">
            {payment.display_name ?? payment.description ?? '—'}
          </p>
        </div>
        <div className="grid justify-items-end gap-1.5">
          <PaymentStatusBadge payment={payment} />
          <span className="text-xs text-tertiary">{paymentStatusNote(payment)}</span>
        </div>
      </div>

      <PaymentLifecycle payment={payment} />
      <QrPanel payment={payment} />

      <DisplayIf when={payment.paid}>
        <PaymentPaidCard paid={payment.paid!} />
      </DisplayIf>

      <PaymentSettlementNotice payment={payment} />

      <PaymentDetailsCard payment={payment} />
      <DisplayIf when={payment.status === 'pending'}>
        <div className="flex flex-wrap items-center gap-3">
          <DisplayIf falsy={isConfirmingCancel}>
            <button
              type="button"
              onClick={() => setIsConfirmingCancel(true)}
              className="cursor-pointer rounded-small bg-transparent px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-action-secondary-hover hover:text-error"
            >
              Cancel payment
            </button>
          </DisplayIf>
          <DisplayIf when={isConfirmingCancel}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-secondary">
                Cancel this payment? The QR stops working immediately.
              </span>
              <Button variant="ghost" size="sm" className="text-secondary" onClick={() => setIsConfirmingCancel(false)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => cancelMutation.mutate(payment.id)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Canceling…' : 'Cancel payment'}
              </Button>
            </div>
          </DisplayIf>
        </div>
      </DisplayIf>
    </div>
  );
}
