// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { WebhookEventType } from '../../../types/api';

export const ALL_EVENTS = '*';

export const EVENT_TYPES: WebhookEventType[] = [
  'payment.created',
  'payment.received',
  'payment.settling',
  'payment.confirming',
  'payment.settled',
  'payment.failed',
  'payment.expired',
  'payment.canceled',
  'test.ping',
];

export function isAllEvents(events: string[]): boolean {
  return events.length === 0 || events[0] === ALL_EVENTS;
}

/** Short column label for an endpoint's subscription, matching the mockup wording. */
export function eventsLabel(events: string[]): string {
  if (isAllEvents(events)) return 'All events';
  if (events.length === 1) return events[0]!;
  return `${events.length} events selected`;
}

/**
 * Chip click semantics: the "All events" chip resets to `['*']`, any specific chip
 * toggles membership and clears the wildcard. Empty selection falls back to `['*']`.
 */
export function toggleEvent(events: string[], event: string): string[] {
  if (event === ALL_EVENTS) return [ALL_EVENTS];
  const current = isAllEvents(events) ? [] : events;
  const next = current.includes(event)
    ? current.filter((item) => item !== event)
    : [...current, event];
  return next.length === 0 ? [ALL_EVENTS] : EVENT_TYPES.filter((type) => next.includes(type));
}

export function sameEvents(a: string[], b: string[]): boolean {
  if (isAllEvents(a) && isAllEvents(b)) return true;
  return a.length === b.length && a.every((event, index) => event === b[index]);
}
