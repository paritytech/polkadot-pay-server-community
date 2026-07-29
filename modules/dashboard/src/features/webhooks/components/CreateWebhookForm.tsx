// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input } from '../../../components/ui';
import { toast } from '../../../stores/toastStore';
import { createWebhook } from '../api/webhookQueries';
import { WebhookEventChips } from './WebhookEventChips';

export interface CreateWebhookFormProps {
  onCancel: () => void;
  onCreated: (secret: string) => void;
}

export function CreateWebhookForm({ onCancel, onCreated }: CreateWebhookFormProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(['*']);

  const mutation = useMutation({
    mutationFn: createWebhook,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({ title: 'Endpoint added — copy your signing secret now', tone: 'success' });
      onCreated(data.secret);
    },
    onError: (error) => {
      toast({
        title: 'Unable to create webhook',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  return (
    <form
      className="grid gap-5 rounded-container bg-surface-container p-5 shadow-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return;
        mutation.mutate({ url: trimmedUrl, events: events.length > 0 ? events : ['*'] });
      }}
    >
      <div className="grid gap-1.5">
        <h2 className="text-lg font-semibold text-primary">Add an endpoint</h2>
        <p className="text-sm text-secondary">Must be HTTPS and reachable from the public internet.</p>
      </div>

      <Field label="Endpoint URL">
        {(id) => (
          <Input
            id={id}
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://api.yourstore.com/webhooks"
            autoComplete="url"
            autoFocus
            className="font-mono"
            disabled={mutation.isPending}
          />
        )}
      </Field>

      <Field label="Events to send">
        {(id) => (
          <div id={id}>
            <WebhookEventChips events={events} onChange={setEvents} disabled={mutation.isPending} />
          </div>
        )}
      </Field>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          Add endpoint
        </Button>
      </div>
    </form>
  );
}
