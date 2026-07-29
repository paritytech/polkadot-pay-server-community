// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, BookOpen, CreditCard, KeyRound, Webhook } from 'lucide-react';

const ACTIONS = [
  { to: '/payments' as const, label: 'Payments', detail: 'Create and track intents', icon: CreditCard },
  { to: '/webhooks' as const, label: 'Webhooks', detail: 'Manage event delivery', icon: Webhook },
  { to: '/keys' as const, label: 'Account & Keys', detail: 'Control API access', icon: KeyRound },
  { to: '/docs' as const, label: 'API Docs', detail: 'Explore the integration', icon: BookOpen },
];

export function QuickActions() {
  return (
    <nav aria-label="Quick actions" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
      {ACTIONS.map(({ to, label, detail, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="group flex items-center gap-3 rounded-nested bg-surface-nested p-3 transition-colors hover:bg-action-secondary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
        >
          <span className="rounded-small bg-surface-container p-2 text-link shadow-1"><Icon className="h-4 w-4" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-primary">{label}</span>
            <span className="block truncate text-xs text-secondary">{detail}</span>
          </span>
          <ArrowUpRight className="h-4 w-4 text-tertiary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ))}
    </nav>
  );
}
