// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { cn } from '../../../lib/utils';
import { ALL_EVENTS, EVENT_TYPES, isAllEvents, toggleEvent } from '../lib/events';

interface WebhookEventChipsProps {
  events: string[];
  onChange: (events: string[]) => void;
  disabled?: boolean;
}

export function WebhookEventChips({ events, onChange, disabled = false }: WebhookEventChipsProps) {
  const allSelected = isAllEvents(events);

  return (
    <div role="group" aria-label="Webhook events" className="flex flex-wrap gap-2">
      {[ALL_EVENTS, ...EVENT_TYPES].map((event) => {
        const selected = event === ALL_EVENTS ? allSelected : !allSelected && events.includes(event);
        const label = event === ALL_EVENTS ? 'All events' : event;
        return (
          <button
            key={event}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(toggleEvent(events, event))}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              event !== ALL_EVENTS && 'font-mono text-xs',
              selected
                ? 'bg-action-primary text-primary-inverted'
                : 'bg-surface-nested text-secondary hover:bg-action-secondary-hover',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
