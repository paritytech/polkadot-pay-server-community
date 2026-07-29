// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment } from '../../../types/api';
import { Card } from '../../../components/ui';
import { cn, formatDateTime } from '../../../lib/utils';
import { settlementState } from './paymentSettlement';

const STEPS = ['Created', 'Received', 'Settling', 'Confirming', 'Settled'];

/**
 * How far the payment has walked the five-step ladder, derived from `status` alone so the ladder
 * only ever moves forward. `confirming` is an aggregate gate the backend sets once every coin of
 * the payment is included on chain, and it is the only signal that Confirming is reached.
 * `claim_tx_hash` is recorded when the first coin is *submitted*, says nothing about inclusion,
 * and must never advance a step. A failed claim stalls on Settling.
 */
function reachedIndex(payment: Payment): number {
  if (payment.status === 'settled') return 4;
  if (payment.status === 'confirming') return 3;
  if (payment.status === 'settling') return 2;
  if (payment.status === 'failed') return 2;
  if (payment.status === 'received') return 1;
  return 0;
}

function lifecycleNote(payment: Payment): string {
  if (payment.status === 'failed') return 'Stuck at settlement';
  if (payment.status === 'settled') return 'Complete';
  if (payment.status === 'canceled') return 'Canceled';
  if (payment.status === 'expired') return 'Expired';
  return 'In progress';
}

export function PaymentLifecycle({ payment }: { payment: Payment }) {
  const reached = reachedIndex(payment);
  const retrying = reached <= 2 && settlementState(payment).kind === 'retrying';
  const settlingWhen =
    payment.status === 'failed'
      ? 'failed'
      : retrying
        ? 'retrying'
        : reached < 2
          ? '—'
          : reached > 2
            ? payment.settlement.claimed_at
              ? formatDateTime(payment.settlement.claimed_at)
              : 'done'
            : 'in progress';
  const confirmingWhen =
    reached < 3 ? '—' : payment.status === 'settled' ? 'done' : 'in progress';
  const when = [
    formatDateTime(payment.created_at),
    payment.paid ? formatDateTime(new Date(payment.paid.payer_timestamp_ms).toISOString()) : '—',
    settlingWhen,
    confirmingWhen,
    payment.status === 'settled' ? formatDateTime(payment.completed_at) : '—',
  ];

  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-primary">Lifecycle</span>
        <span className="text-sm text-tertiary">{lifecycleNote(payment)}</span>
      </div>
      <ol className="grid grid-cols-5 gap-3">
        {STEPS.map((label, index) => {
          const isFailedStep = payment.status === 'failed' && index === 2;
          const isRetryingStep = retrying && index === 2;
          const isReached = index <= reached;
          return (
            <li key={label} className="grid gap-2">
              <span
                className={cn(
                  'h-[3px] rounded-full',
                  isFailedStep
                    ? 'bg-status-error'
                    : isRetryingStep
                      ? 'bg-status-warning'
                      : isReached
                        ? 'bg-success'
                        : 'bg-[var(--border-divider-tint)]',
                )}
                aria-hidden
              />
              <span className="grid gap-0.5">
                <span className={cn('text-sm font-medium', isReached || isRetryingStep ? 'text-primary' : 'text-tertiary')}>
                  {label}
                </span>
                <span className="text-xs text-tertiary">{when[index]}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
