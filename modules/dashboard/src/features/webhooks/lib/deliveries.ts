// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { EventDelivery, EventEnvelope } from '../../../types/api';
import { formatRelativeTime, plural } from '../../../lib/utils';

export interface DeliveryRow {
  event: EventEnvelope;
  delivery: EventDelivery;
}

export interface EndpointHealth {
  failing: number;
  label: string;
  tone: 'success' | 'error' | 'neutral';
  lastAt: string | null;
}

/** Newest-first flattening of the event feed into one row per delivery attempt. */
export function flattenDeliveries(events: EventEnvelope[]): DeliveryRow[] {
  return events
    .flatMap((event) => event.deliveries.map((delivery) => ({ event, delivery })))
    .sort((a, b) => Date.parse(b.delivery.created_at) - Date.parse(a.delivery.created_at));
}

/** "HTTP 200 · 2 attempts · 9 min ago" — the secondary line beside a delivery status. */
export function deliveryDetail(delivery: EventDelivery): string {
  const parts = [
    delivery.last_status_code === null ? null : `HTTP ${delivery.last_status_code}`,
    plural(delivery.attempt_count, 'attempt'),
    formatRelativeTime(delivery.delivered_at ?? delivery.created_at),
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Health derived from the recent delivery feed — no dedicated endpoint exists for it. */
export function endpointHealth(rows: DeliveryRow[], endpointId: string): EndpointHealth {
  const mine = rows.filter((row) => row.delivery.endpoint_id === endpointId);
  const failing = mine.filter(
    (row) => row.delivery.status === 'failed' || row.delivery.last_error !== null,
  ).length;
  const lastAt = mine[0]?.delivery.created_at ?? null;
  if (mine.length === 0) return { failing: 0, label: 'No deliveries', tone: 'neutral', lastAt };
  if (failing > 0) return { failing, label: `${failing} failing`, tone: 'error', lastAt };
  return { failing: 0, label: 'Healthy', tone: 'success', lastAt };
}
