// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { accountQueryOptions } from '../features/account/api/accountQueries';
import { paymentsQueryOptions } from '../features/payments/api/paymentQueries';
import { isOngoingPayment } from '../features/payments/components/paymentFilters';
import { QUICK_START_STEPS, useQuickStartCount } from '../features/quickstart/useQuickStartProgress';
import { useHealthState, type HealthState } from '../lib/healthQuery';
import { cn } from '../lib/utils';
import {
  BookIcon,
  BoltIcon,
  CardIcon,
  ExternalArrowIcon,
  KeysIcon,
  WebhookIcon,
} from './ShellIcons';
import { DisplayIf } from './ui';

const ITEM = 'flex items-center gap-3 rounded-nested px-3 py-2 text-left text-sm font-medium transition-colors';
const IDLE = 'text-secondary hover:bg-selection-container-hover hover:text-primary';
const ACTIVE = 'bg-selection-container-active text-primary';

const CHAIN_LABEL: Record<HealthState, string> = {
  connected: 'chain connected',
  reconnecting: 'chain reconnecting',
  unreachable: 'backend unreachable',
  checking: 'checking backend…',
};

function useOngoingCount(): number {
  const { data } = useQuery({
    ...paymentsQueryOptions({}),
    refetchInterval: (query) => (query.state.data?.data.some(isOngoingPayment) ? 5000 : false),
  });
  return (data?.data ?? []).filter(isOngoingPayment).length;
}

export function ShellNav({ onNavigate }: { onNavigate: () => void }) {
  const ongoing = useOngoingCount();
  const doneCount = useQuickStartCount();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      <Link to="/keys" onClick={onNavigate} className={cn(ITEM, IDLE)} activeProps={{ className: cn(ITEM, ACTIVE) }}>
        <KeysIcon />
        <span>Account &amp; Keys</span>
      </Link>

      <Link to="/webhooks" onClick={onNavigate} className={cn(ITEM, IDLE)} activeProps={{ className: cn(ITEM, ACTIVE) }}>
        <WebhookIcon />
        <span>Webhooks</span>
      </Link>

      <Link to="/payments" onClick={onNavigate} className={cn(ITEM, IDLE)} activeProps={{ className: cn(ITEM, ACTIVE) }}>
        <CardIcon />
        <span className="flex-1">Payments</span>
        <DisplayIf when={ongoing > 0}>
          <span className="inline-flex items-center rounded-full bg-surface-nested px-2.5 py-0.5 text-xs font-medium text-secondary">
            {ongoing}
            <span className="sr-only"> payments in progress</span>
          </span>
        </DisplayIf>
      </Link>

      <div aria-hidden className="mx-3 my-2 h-px bg-divider" />

      <Link
        to="/quick-start"
        onClick={onNavigate}
        className={cn(ITEM, IDLE)}
        activeProps={{ className: cn(ITEM, ACTIVE) }}
      >
        <BoltIcon />
        <span className="flex-1">Quick Start</span>
        <span className="text-xs text-tertiary">
          {doneCount}/{QUICK_START_STEPS}
          <span className="sr-only"> steps done</span>
        </span>
      </Link>

      <a href="/docs/reference" target="_blank" rel="noreferrer" className={cn(ITEM, IDLE)}>
        <BookIcon />
        <span className="flex-1">API Docs</span>
        <ExternalArrowIcon />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </nav>
  );
}

/** Merchant identity plus live backend state, from /v1/account and /healthz. */
export function ShellMerchantCard() {
  const { data: account } = useQuery(accountQueryOptions);
  const { state, dotClass } = useHealthState();

  return (
    <div className="flex flex-col gap-1.5 rounded-nested bg-surface-nested p-3">
      <span className="truncate text-sm font-medium text-primary">{account?.name ?? 'Merchant'}</span>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('h-1.5 w-1.5 flex-none rounded-full', dotClass)} />
        <code className="text-xs text-tertiary">{CHAIN_LABEL[state]}</code>
      </div>
    </div>
  );
}
