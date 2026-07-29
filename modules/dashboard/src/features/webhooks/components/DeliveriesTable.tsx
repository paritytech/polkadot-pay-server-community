// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { Button, DisplayIf, EmptyState, Spinner } from '../../../components/ui';
import { cn, shortId } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { eventsQueryOptions, resendEvent, webhooksQueryOptions } from '../api/webhookQueries';
import { deliveryDetail, flattenDeliveries, type DeliveryRow } from '../lib/deliveries';

type Filter = 'all' | 'failed' | 'retried';

const ROW = 'grid grid-cols-[minmax(0,1fr)_minmax(0,220px)_100px] items-center gap-4';

interface FilterPillProps {
  label: string;
  filter: Filter;
  count: number;
  active: Filter;
  onSelect: (filter: Filter) => void;
}

function FilterPill({ label, filter, count, active, onSelect }: FilterPillProps) {
  const isActive = active === filter;
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => onSelect(filter)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors',
        isActive ? 'bg-action-primary text-primary-inverted' : 'bg-surface-nested text-secondary hover:bg-action-secondary-hover',
      )}
    >
      <span>{label}</span>
      <span className="font-mono text-xs opacity-80">{count}</span>
    </button>
  );
}

export function DeliveriesTable() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const query = useQuery(eventsQueryOptions);
  const webhooksQuery = useQuery(webhooksQueryOptions);

  const rows = useMemo(
    () => flattenDeliveries(query.data?.data ?? []),
    [query.data],
  );
  const endpointUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const endpoint of webhooksQuery.data?.data ?? []) map.set(endpoint.id, endpoint.url);
    return map;
  }, [webhooksQuery.data]);

  const isLoading = query.isPending && rows.length === 0;
  const isError = query.isError && rows.length === 0;
  const errorMessage = query.error instanceof Error ? query.error.message : 'Request failed.';

  const counts = useMemo(
    () => ({
      all: rows.length,
      failed: rows.filter((r) => r.delivery.status === 'failed').length,
      retried: rows.filter((r) => r.delivery.attempt_count > 1).length,
    }),
    [rows],
  );

  const visibleRows = useMemo(() => {
    if (filter === 'failed') return rows.filter((r) => r.delivery.status === 'failed');
    if (filter === 'retried') return rows.filter((r) => r.delivery.attempt_count > 1);
    return rows;
  }, [rows, filter]);

  const resendMutation = useMutation({
    mutationFn: resendEvent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'recent'] });
      toast({ title: 'Event resent', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to resend event',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  return (
    <section className="grid gap-4">
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-primary">Recent deliveries</h2>
        <p className="text-sm text-secondary">The latest event attempts and their delivery outcomes.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyState
          icon={Inbox}
          title="Unable to load deliveries"
          description={errorMessage}
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No deliveries yet" />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label="All" filter="all" count={counts.all} active={filter} onSelect={setFilter} />
            <FilterPill label="Failed" filter="failed" count={counts.failed} active={filter} onSelect={setFilter} />
            <FilterPill label="Retried" filter="retried" count={counts.retried} active={filter} onSelect={setFilter} />
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing here" description="No deliveries match this filter." />
          ) : (
            <div className="overflow-hidden rounded-container bg-surface-container shadow-1">
              <div role="table" aria-label="Recent deliveries">
                <div
                  role="row"
                  className={cn(ROW, 'border-b border-divider px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-tertiary')}
                >
                  <span role="columnheader">Event</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader" className="flex justify-end">
                    <span className="sr-only">Actions</span>
                  </span>
                </div>
                {visibleRows.map((row) => (
                  <DeliveryRowView
                    key={`${row.event.id}:${row.delivery.id}`}
                    row={row}
                    destination={endpointUrls.get(row.delivery.endpoint_id)?.replace(/^https?:\/\//, '') ?? shortId(row.delivery.endpoint_id)}
                    isResending={resendMutation.isPending && resendMutation.variables === row.event.id}
                    onResend={() => resendMutation.mutate(row.event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface DeliveryRowViewProps {
  row: DeliveryRow;
  destination: string;
  isResending: boolean;
  onResend: () => void;
}

function DeliveryRowView({ row, destination, isResending, onResend }: DeliveryRowViewProps) {
  const { event, delivery } = row;
  const dotTone =
    delivery.status === 'succeeded' ? 'bg-success' : delivery.status === 'failed' ? 'bg-error' : 'bg-warning';
  const labelTone =
    delivery.status === 'succeeded' ? 'text-success' : delivery.status === 'failed' ? 'text-error' : 'text-secondary';

  return (
    <div role="row" className={cn(ROW, 'border-b border-divider p-4 last:border-b-0')}>
      <div role="cell" className="grid min-w-0 gap-1">
        <span className="truncate font-mono text-sm text-primary">{event.type}</span>
        <span className="truncate font-mono text-xs text-tertiary">{destination}</span>
      </div>

      <div role="cell" className="grid min-w-0 gap-1">
        <span className="flex items-center gap-2 text-sm">
          <span className={cn('h-1.5 w-1.5 rounded-full', dotTone)} aria-hidden />
          <span className={cn('font-medium', labelTone)}>{delivery.status}</span>
        </span>
        <span className="truncate text-xs text-tertiary">{deliveryDetail(delivery)}</span>
        <DisplayIf when={delivery.last_error && delivery.last_error !== `HTTP ${delivery.last_status_code}`}>
          <span className="truncate text-xs text-error">{delivery.last_error}</span>
        </DisplayIf>
      </div>

      <div role="cell" className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onResend} disabled={isResending}>
          Resend
        </Button>
      </div>
    </div>
  );
}