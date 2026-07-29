// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import type { WebhookEndpoint, WebhookStatus } from '../../../types/api';
import { Button, DisplayIf, Field, Input } from '../../../components/ui';
import { cn } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { deleteWebhook, testWebhook, updateWebhook } from '../api/webhookQueries';
import { sameEvents } from '../lib/events';
import { WebhookEventChips } from './WebhookEventChips';

interface EndpointEditorProps {
  webhook: WebhookEndpoint;
  rotatePending: boolean;
  onRotate: () => void;
}

const SWITCH_KNOB =
  'pointer-events-none absolute top-[2px] h-[11px] w-[11px] rounded-full bg-white transition-transform';

export function EndpointEditor({ webhook, rotatePending, onRotate }: EndpointEditorProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(webhook.url);
  const [events, setEvents] = useState<string[]>(webhook.events);
  const [status, setStatus] = useState<WebhookStatus>(webhook.status);
  const [confirming, setConfirming] = useState(false);

  const dirty = url.trim() !== webhook.url || !sameEvents(events, webhook.events) || status !== webhook.status;

  const updateMutation = useMutation({
    mutationFn: () =>
      updateWebhook(webhook.id, {
        url: url.trim(),
        events: events.length > 0 ? events : ['*'],
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Endpoint updated', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to update endpoint',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testWebhook(webhook.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', 'recent'] });
      toast({ title: 'Test event queued', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to queue test event',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWebhook(webhook.id),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Endpoint deleted', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to delete endpoint',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  const enabled = status === 'enabled';

  return (
    <div className="border-b border-divider bg-surface-nested p-4">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Field label="Endpoint URL">
            {(id) => (
              <Input
                id={id}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={updateMutation.isPending}
                className="font-mono"
              />
            )}
          </Field>

          <Field label="Status">
            {(id) => (
              <div id={id} className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={enabled ? 'Disable endpoint' : 'Enable endpoint'}
                  disabled={updateMutation.isPending}
                  onClick={() => setStatus(enabled ? 'disabled' : 'enabled')}
                  className={cn(
                    'relative inline-flex h-[15px] w-[26px] cursor-pointer items-center rounded-full transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    enabled ? 'bg-success' : 'bg-action-secondary',
                  )}
                >
                  <span className={cn(SWITCH_KNOB, enabled ? 'translate-x-[13px]' : 'translate-x-[2px]')} />
                  <span className="sr-only">{enabled ? 'Enabled' : 'Disabled'}</span>
                </button>
                <span className="text-xs text-tertiary">{enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            )}
          </Field>
        </div>

        <Field label="Events to send" hint="Pick one or more events to receive, or select All events for everything.">
          {(id) => (
            <div id={id}>
              <WebhookEventChips events={events} onChange={setEvents} disabled={updateMutation.isPending} />
            </div>
          )}
        </Field>

        <Field label="Signing secret">
          {(id) => (
            <div id={id} className="flex flex-wrap items-center gap-3">
              <code className="font-mono text-sm text-tertiary">whsec_••••••••••••••••</code>
              <Button variant="secondary" size="sm" onClick={onRotate} disabled={rotatePending}>
                Rotate
              </Button>
            </div>
          )}
        </Field>

        <div className="border-t border-divider" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !enabled}
            >
              <Zap className="h-4 w-4" aria-hidden />
              Send test.ping
            </Button>
            <DisplayIf when={!confirming}>
              <Button
                variant="ghost"
                size="sm"
                className="text-secondary hover:text-error"
                onClick={() => setConfirming(true)}
              >
                Delete endpoint
              </Button>
            </DisplayIf>
            <DisplayIf when={confirming}>
              <span className="text-sm text-primary">Delete and stop all deliveries?</span>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleteMutation.isPending}>
                Keep
              </Button>
              <Button variant="danger" size="sm" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                Delete
              </Button>
            </DisplayIf>
          </div>

          <DisplayIf when={dirty}>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUrl(webhook.url);
                  setEvents(webhook.events);
                  setStatus(webhook.status);
                }}
                disabled={updateMutation.isPending}
              >
                Discard
              </Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !url.trim()}>
                Save changes
              </Button>
            </div>
          </DisplayIf>
        </div>
      </div>
    </div>
  );
}