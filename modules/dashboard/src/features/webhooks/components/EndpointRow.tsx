// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import type { WebhookEndpoint } from '../../../types/api';
import { CopyIdButton, DisplayIf } from '../../../components/ui';
import { cn, formatRelativeTime, shortId } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { rotateWebhookSecret } from '../api/webhookQueries';
import type { DeliveryRow } from '../lib/deliveries';
import { endpointHealth } from '../lib/deliveries';
import { eventsLabel } from '../lib/events';
import { EndpointEditor } from './EndpointEditor';

interface EndpointRowProps {
  webhook: WebhookEndpoint;
  rows: DeliveryRow[];
  onSecret: (secret: string) => void;
  editKey: string;
  isLast: boolean;
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_140px_140px_40px] items-center gap-4';

export function EndpointRow({ webhook, rows, onSecret, editKey, isLast }: EndpointRowProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const health = endpointHealth(rows, webhook.id);
  const enabled = webhook.status === 'enabled';
  const endpointName = webhook.url;

  const healthColor =
    health.tone === 'success' ? 'text-success' : health.tone === 'error' ? 'text-error' : 'text-tertiary';
  const healthDot =
    health.tone === 'success' ? 'bg-success' : health.tone === 'error' ? 'bg-error' : 'bg-tertiary';

  const rotateMutation = useMutation({
    mutationFn: () => rotateWebhookSecret(webhook.id),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      onSecret(data.secret);
      toast({ title: 'Secret rotated', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to rotate secret',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  return (
    <div>
      <div role="row" className={cn(ROW_GRID, 'p-4', !isLast || open ? 'border-b border-divider' : '')}>
        <div role="cell" className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', enabled ? 'bg-success' : 'bg-tertiary')}
              aria-hidden
            />
            <span className="truncate font-mono text-sm text-primary">{endpointName}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs text-tertiary">{shortId(webhook.id)}</span>
            <CopyIdButton value={webhook.id} label={`Copy ID for ${endpointName}`} />
          </span>
        </div>

        <div role="cell" className="grid min-w-0 gap-1">
          <span className="truncate text-sm text-primary">{eventsLabel(webhook.events)}</span>
          <span className="text-xs text-tertiary">events</span>
        </div>

        <div role="cell" className="grid min-w-0 gap-1">
          <span className={cn('flex items-center gap-2 text-sm font-medium', healthColor)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', healthDot)} aria-hidden />
            {health.label}
          </span>
          <span className="truncate text-xs text-tertiary">{formatRelativeTime(health.lastAt)}</span>
        </div>

        <div role="cell" className="flex justify-end">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? `Collapse ${endpointName}` : `Expand ${endpointName}`}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-small text-secondary hover:bg-action-secondary-hover"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <DisplayIf when={open}>
        <EndpointEditor
          key={editKey}
          webhook={webhook}
          rotatePending={rotateMutation.isPending}
          onRotate={() => rotateMutation.mutate()}
        />
      </DisplayIf>
    </div>
  );
}