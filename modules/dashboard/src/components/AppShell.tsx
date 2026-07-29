// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useRef, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CreditCard, KeyRound, LogOut, Menu, Webhook, X, Zap, type LucideIcon } from 'lucide-react';
import { accountQueryOptions } from '../features/account/api/accountQueries';
import { paymentsQueryOptions } from '../features/payments/api/paymentQueries';
import { isOngoingPayment } from '../features/payments/components/paymentFilters';
import { QUICK_START_STEPS, useQuickStartCount } from '../features/quickstart/useQuickStartProgress';
import { useHealthState } from '../lib/healthQuery';
import { cn } from '../lib/utils';
import { useAuthStore } from '../stores/authStore';
import { ThemeToggle } from './ThemeToggle';
import { DisplayIf } from './ui';

interface NavLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavLink[] = [
  { to: '/keys', label: 'Account & Keys', icon: KeyRound },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
];

const ITEM =
  'group flex items-center gap-3 rounded-nested px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer';
const ITEM_IDLE = 'text-secondary hover:bg-selection-container-hover hover:text-primary';
const ITEM_ACTIVE = 'bg-selection-container-active text-primary';
const ITEM_ICON = 'h-5 w-5 shrink-0 transition-colors';
const CONTROL =
  'inline-flex cursor-pointer items-center gap-2 rounded-nested px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-selection-container-hover hover:text-primary';

function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center">
        <img src="/logo-symbol_dark.svg" alt="" className="brand-logo-light h-5 w-auto" />
        <img src="/logo-symbol_light.svg" alt="" className="brand-logo-dark h-5 w-auto" />
      </span>
      <span className="font-display text-[18px] leading-tight text-primary">PolkaPay</span>
    </span>
  );
}

function PrimaryNavLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <>
      {PRIMARY_NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link key={to} to={to} onClick={onNavigate} className={cn(ITEM, active ? ITEM_ACTIVE : ITEM_IDLE)}>
            <Icon aria-hidden className={cn(ITEM_ICON, active ? 'text-link' : 'text-tertiary group-hover:text-secondary')} />
            <span>{label}</span>
          </Link>
        );
      })}
    </>
  );
}

function PaymentsLink({ onNavigate }: { onNavigate: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === '/payments' || pathname.startsWith('/payments/');
  const { data } = useQuery(paymentsQueryOptions({}));
  const ongoing = (data?.data ?? []).filter(isOngoingPayment).length;
  return (
    <Link to="/payments" onClick={onNavigate} className={cn(ITEM, active ? ITEM_ACTIVE : ITEM_IDLE)}>
      <CreditCard aria-hidden className={cn(ITEM_ICON, active ? 'text-link' : 'text-tertiary group-hover:text-secondary')} />
      <span className="flex-1">Payments</span>
      <DisplayIf when={ongoing > 0}>
        <span className="inline-flex items-center rounded-full bg-surface-nested px-2.5 py-0.5 text-xs font-medium text-secondary">
          {ongoing}
          <span className="sr-only"> payments in progress</span>
        </span>
      </DisplayIf>
    </Link>
  );
}

function QuickStartLink({ onNavigate }: { onNavigate: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === '/quick-start';
  const done = useQuickStartCount();
  return (
    <Link to="/quick-start" onClick={onNavigate} className={cn(ITEM, active ? ITEM_ACTIVE : ITEM_IDLE)}>
      <Zap aria-hidden className={cn(ITEM_ICON, active ? 'text-link' : 'text-tertiary group-hover:text-secondary')} />
      <span className="flex-1">Quick Start</span>
      <span className="text-xs text-tertiary">
        {done}/{QUICK_START_STEPS}
        <span className="sr-only"> steps done</span>
      </span>
    </Link>
  );
}

function ApiDocsLink() {
  return (
    <a href="/docs/reference" target="_blank" rel="noreferrer" className={cn(ITEM, ITEM_IDLE)}>
      <BookOpen aria-hidden className={cn(ITEM_ICON, 'text-tertiary group-hover:text-secondary')} />
      <span className="flex-1">API Docs</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function MerchantCard() {
  const { data: account } = useQuery(accountQueryOptions);
  const { dotClass } = useHealthState();
  return (
    <div className="flex flex-col gap-1.5 rounded-nested bg-surface-nested p-3">
      <span className="truncate text-sm font-medium text-primary">{account?.name ?? 'Merchant'}</span>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('h-1.5 w-1.5 flex-none rounded-full', dotClass)} />
        <code className="text-xs text-tertiary">paseo-next-v2</code>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const signOut = useAuthStore((s) => s.signOut);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <a className="skip-link" href="#app-main">
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-divider bg-surface-container px-4 py-2 lg:hidden">
        <Brand />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <button
            ref={toggleRef}
            type="button"
            aria-controls="app-nav"
            aria-expanded={isNavOpen}
            onClick={() => setIsNavOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !isNavOpen) return;
              setIsNavOpen(false);
              toggleRef.current?.focus();
            }}
            className={CONTROL}
          >
            {isNavOpen ? <X aria-hidden className="h-4 w-4" /> : <Menu aria-hidden className="h-4 w-4" />}
            Menu
          </button>
        </div>
      </header>

      <aside
        id="app-nav"
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !isNavOpen) return;
          setIsNavOpen(false);
          toggleRef.current?.focus();
        }}
        className={cn(
          'app-rail z-20 shrink-0 flex-col gap-1 border-divider p-4',
          'max-lg:border-b',
          'lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:overflow-y-auto lg:border-r',
          isNavOpen ? 'flex' : 'hidden',
        )}
      >
        <div className="px-3 pb-4 pt-2 max-lg:hidden">
          <Brand />
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1">
          <PrimaryNavLinks onNavigate={() => setIsNavOpen(false)} />
          <PaymentsLink onNavigate={() => setIsNavOpen(false)} />

          <div aria-hidden className="mx-3 my-2 h-px bg-divider" />

          <QuickStartLink onNavigate={() => setIsNavOpen(false)} />
          <ApiDocsLink />
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <MerchantCard />
          <div className="flex items-center justify-between border-t border-divider pt-3 max-lg:mt-4">
            <button type="button" onClick={signOut} className={CONTROL}>
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </button>
            <span className="max-lg:hidden">
              <ThemeToggle />
            </span>
          </div>
        </div>
      </aside>

      <main id="app-main" tabIndex={-1} className="app-canvas min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto w-full max-w-[1024px] px-4 py-10 pb-[88px] sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}