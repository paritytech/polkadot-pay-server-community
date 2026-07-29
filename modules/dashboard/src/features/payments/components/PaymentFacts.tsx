// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';
import type { Payment, PaymentPaid } from '../../../types/api';
import { Card, CopyButton, DisplayIf } from '../../../components/ui';
import { settlementState } from './paymentSettlement';

import { formatCurrency, formatDateTime } from '../../../lib/utils';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-sm font-medium text-primary">{label}</span>
      <span className="break-words text-sm text-secondary">{children}</span>
    </div>
  );
}

/** Renders nothing until the payer's coins land, so the caller can stay unconditional. */
export function PaymentPaidCard({ paid }: { paid: PaymentPaid | null }) {
  if (!paid) return null;
  return (
    <Card className="grid gap-4">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
        <span className="text-sm font-medium text-primary">Paid</span>
      </div>
      <div className="flex flex-wrap gap-y-4 gap-x-12">
        <div className="grid gap-1.5">
          <span className="text-xs text-tertiary">Amount</span>
          <span className="font-mono text-sm text-primary">{paid.amount} {formatCurrency('CASH')}</span>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-tertiary">Coins</span>
          <span className="font-mono text-sm text-primary">{paid.coin_count}</span>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <span className="text-xs text-tertiary">Payer timestamp</span>
          <span className="text-sm text-primary">
            {formatDateTime(new Date(paid.payer_timestamp_ms).toISOString())}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function PaymentSettlementNotice({ payment }: { payment: Payment }) {
  const state = settlementState(payment);
  if (state.kind === 'none') return null;

  if (state.kind === 'retrying') {
    return (
      <Card className="grid gap-1.5 border border-warning">
        <span className="text-sm font-medium text-warning">Settlement retrying</span>
        <span className="text-sm leading-relaxed text-secondary">{state.message}</span>
        <span className="text-xs text-tertiary">
          Attempt {state.attempt} of {state.maxAttempts} — will retry automatically
        </span>
      </Card>
    );
  }

  return (
    <Card className="grid gap-1.5 border border-error">
      <span className="text-sm font-medium text-error">Settlement failed</span>
      <span className="text-sm leading-relaxed text-secondary">{state.message}</span>
      <span className="text-xs text-tertiary">
        Gave up after {state.attempt} of {state.maxAttempts} attempts
      </span>
    </Card>
  );
}

export function PaymentDetailsCard({ payment }: { payment: Payment }) {
  const { settlement } = payment;
  const claimTxHashes =
    settlement.claim_tx_hashes.length > 0
      ? settlement.claim_tx_hashes
      : settlement.claim_tx_hash
        ? [settlement.claim_tx_hash]
        : [];
  return (
    <Card className="grid gap-6">
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-primary">Payment ID</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-sm text-primary">{payment.id}</code>
          <CopyButton value={payment.id} label="Copy ID" />
        </div>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(196px,1fr))]">
        <Fact label="Description">{payment.description ?? '—'}</Fact>
        <Fact label="Reference">{payment.reference ?? '—'}</Fact>
        <Fact label="Display name">{payment.display_name ?? '—'}</Fact>
        <Fact label="Created">{formatDateTime(payment.created_at)}</Fact>
        <Fact label="Expires">{formatDateTime(payment.expires_at)}</Fact>
        <Fact label="Received">{formatDateTime(payment.received_at)}</Fact>
        <Fact label="Completed">{formatDateTime(payment.completed_at)}</Fact>
        <Fact label={claimTxHashes.length > 1 ? `Claim txs (${claimTxHashes.length})` : 'Claim tx'}>
          <DisplayIf when={claimTxHashes.length > 0}>
            <span className="grid gap-1">
              {claimTxHashes.map((hash) => (
                <code key={hash} className="break-all font-mono text-xs text-primary">{hash}</code>
              ))}
            </span>
          </DisplayIf>
          <DisplayIf falsy={claimTxHashes.length > 0}>—</DisplayIf>
        </Fact>
        <DisplayIf when={payment.canceled_at}>
          <Fact label="Canceled">{formatDateTime(payment.canceled_at)}</Fact>
        </DisplayIf>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-primary">Metadata</span>
        <div className="rounded-nested bg-surface-nested p-4">
          <pre className="overflow-x-auto text-sm leading-relaxed text-secondary">
            <code className="font-mono">{JSON.stringify(payment.metadata, null, 2)}</code>
          </pre>
        </div>
      </div>
    </Card>
  );
}
