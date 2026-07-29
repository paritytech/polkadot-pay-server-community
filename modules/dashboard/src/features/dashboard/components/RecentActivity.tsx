// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Activity } from 'lucide-react';
import type { EventEnvelope } from '../../../types/api';
import { EmptyState } from '../../../components/ui';
import { formatDateTime, shortId } from '../../../lib/utils';

export function RecentActivity({ events }: { events: EventEnvelope[] }) {
  if (events.length === 0) {
    return <EmptyState icon={Activity} title="No events yet" description="Webhook activity will appear here." />;
  }

  return (
    <ol className="grid" aria-label="Recent webhook activity">
      {events.slice(0, 5).map((event) => {
        const successful = event.deliveries.filter((delivery) => delivery.status === 'succeeded').length;
        const failed = event.deliveries.filter((delivery) => delivery.status === 'failed').length;
        return (
          <li key={event.id} className="flex gap-3 border-b border-divider py-3 first:pt-0 last:border-0 last:pb-0">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-link" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-primary">{event.type}</p>
                <time className="text-xs text-tertiary" dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
              </div>
              <p className="mt-1 text-xs text-secondary">
                <span className="font-mono">{shortId(event.id, 8, 4)}</span>
                {' · '}{event.deliveries.length} deliveries · {successful} succeeded · {failed} failed
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
