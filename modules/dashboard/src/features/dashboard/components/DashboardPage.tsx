// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Button, Card, DisplayIf } from '../../../components/ui';
import { useDashboardQueries } from '../useDashboardQueries';
import { KpiCard, KpiSkeleton } from './KpiCard';
import { PaymentStatusBreakdown } from './PaymentStatusBreakdown';
import { QuickActions } from './QuickActions';
import { RecentActivity } from './RecentActivity';
import { RecentPayments } from './RecentPayments';

export function DashboardPage() {
  const queries = useDashboardQueries();
  const payments = queries.payments.data?.data ?? [];
  const webhooks = queries.webhooks.data?.data ?? [];
  const events = queries.events.data?.data ?? [];
  const activePayments = payments.filter((payment) => ['pending', 'received', 'settling', 'confirming'].includes(payment.status)).length;
  const enabledWebhooks = webhooks.filter((webhook) => webhook.status === 'enabled').length;
  const isInitialLoading = [queries.payments, queries.webhooks, queries.events].some((query) => query.isPending);
  const failedQueries = [queries.payments, queries.webhooks, queries.events].filter((query) => query.isError);

  const retryFailed = () => {
    failedQueries.forEach((query) => void query.refetch());
  };

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-link">Operations overview</p>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">Payment control center</h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">Monitor current payment flow, delivery health, and recent account activity.</p>
        </div>
        <Link to="/payments" className="inline-flex items-center gap-2 text-sm font-medium text-link hover:text-link-hover">
          View all payments <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      <DisplayIf when={failedQueries.length > 0}>
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-container bg-surface-container p-4 shadow-1 ring-1 ring-error">
          <AlertTriangle className="h-5 w-5 text-error" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary">Some dashboard data could not be loaded</p>
            <p className="text-xs text-secondary">Available sections remain visible. Retry the failed requests.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={retryFailed}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Retry
          </Button>
        </div>
      </DisplayIf>

      <section aria-labelledby="dashboard-metrics-title">
        <h2 id="dashboard-metrics-title" className="sr-only">Current metrics</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isInitialLoading}>
          {queries.payments.isPending ? <KpiSkeleton /> : <KpiCard label="Recent payments" value={queries.payments.isError ? '—' : payments.length} detail={queries.payments.isError ? 'Payment data unavailable' : 'Latest 25 payment records'} tone="accent" />}
          {queries.payments.isPending ? <KpiSkeleton /> : <KpiCard label="In progress" value={queries.payments.isError ? '—' : activePayments} detail={queries.payments.isError ? 'Payment data unavailable' : 'Pending, received, settling, or confirming'} />}
          {queries.webhooks.isPending ? <KpiSkeleton /> : <KpiCard label="Active endpoints" value={queries.webhooks.isError ? '—' : enabledWebhooks} detail={queries.webhooks.isError ? 'Endpoint data unavailable' : `${webhooks.length} endpoints returned`} />}
          {queries.events.isPending ? <KpiSkeleton /> : <KpiCard label="Recent events" value={queries.events.isError ? '—' : events.length} detail={queries.events.isError ? 'Event data unavailable' : 'Latest 25 webhook events'} />}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
        <Section title="Recent payments" description="Latest payment intents and their current state.">
          {queries.payments.isPending ? <TableSkeleton /> : queries.payments.isError ? <Unavailable label="payments" /> : <RecentPayments payments={payments} />}
        </Section>
        <div className="grid content-start gap-6">
          <Section title="Status mix" description="Distribution across the latest payment records.">
            {queries.payments.isPending ? <PanelSkeleton /> : queries.payments.isError ? <Unavailable label="payment status" /> : <PaymentStatusBreakdown payments={payments} />}
          </Section>
          <Section title="Quick actions" description="Common operational destinations."><QuickActions /></Section>
        </div>
      </div>

      <Section title="Recent activity" description="Webhook event delivery from the latest event records.">
        {queries.events.isPending ? <PanelSkeleton /> : queries.events.isError ? <Unavailable label="activity" /> : <RecentActivity events={events} />}
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-5">
      <div><h2 className="text-lg font-semibold text-primary">{title}</h2><p className="mt-1 text-sm text-secondary">{description}</p></div>
      {children}
    </Card>
  );
}

function Unavailable({ label }: { label: string }) {
  return <p role="status" className="rounded-nested bg-surface-nested px-4 py-8 text-center text-sm text-secondary">Unable to load {label} data.</p>;
}

function PanelSkeleton() {
  return <div className="h-28 animate-pulse rounded-nested bg-surface-nested" aria-label="Loading section" />;
}
function TableSkeleton() {
  return <div className="grid gap-3" aria-label="Loading payments">{['one', 'two', 'three', 'four'].map((key) => <div key={key} className="h-12 animate-pulse rounded-nested bg-surface-nested" />)}</div>;
}
