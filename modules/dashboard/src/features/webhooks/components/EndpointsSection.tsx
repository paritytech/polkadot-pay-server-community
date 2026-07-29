// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Webhook } from 'lucide-react';
import { Button, DisplayIf, EmptyState, SecretRevealCard, Spinner } from '../../../components/ui';
import { plural } from '../../../lib/utils';
import { eventsQueryOptions, webhooksQueryOptions } from '../api/webhookQueries';
import { flattenDeliveries } from '../lib/deliveries';
import { CreateWebhookForm } from './CreateWebhookForm';
import { EndpointRow } from './EndpointRow';

export function EndpointsSection() {
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  const webhooksQuery = useQuery(webhooksQueryOptions);
  const eventsQuery = useQuery(eventsQueryOptions);
  const webhooks = webhooksQuery.data?.data ?? [];
  const rows = flattenDeliveries(eventsQuery.data?.data ?? []);
  const isLoading = webhooksQuery.isPending && webhooks.length === 0;
  const isError = webhooksQuery.isError && webhooks.length === 0;
  const errorMessage = webhooksQuery.error instanceof Error ? webhooksQuery.error.message : 'Request failed.';

  const editKey = (webhook: { id: string; url: string; status: string; events: string[] }) =>
    `${webhook.id}:${webhook.url}:${webhook.status}:${webhook.events.join('|')}`;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-primary">Endpoints</h2>
          <p className="mt-1.5 text-sm text-secondary">
            {plural(webhooks.length, 'endpoint')} · verify the signature header before trusting a payload.
          </p>
        </div>
        <DisplayIf when={!creating}>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add endpoint
          </Button>
        </DisplayIf>
      </div>

      <DisplayIf when={creating}>
        <CreateWebhookForm
          onCancel={() => setCreating(false)}
          onCreated={(secret) => {
            setCreating(false);
            setReveal(secret);
          }}
        />
      </DisplayIf>

      {reveal === null ? null : (
        <SecretRevealCard
          title="Copy your signing secret now"
          description="This is the only time it will be shown."
          label="Signing secret"
          secret={reveal}
          onDismiss={() => setReveal(null)}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : isError ? (
        <EmptyState
          icon={Webhook}
          title="Unable to load endpoints"
          description={errorMessage}
          action={
            <Button variant="secondary" size="sm" onClick={() => void webhooksQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No endpoints yet"
          description="Add one and we'll start posting events to it within a few seconds."
        />
      ) : (
        <div className="overflow-hidden rounded-container bg-surface-container shadow-1">
          <div role="table" aria-label="Webhook endpoints">
            {webhooks.map((webhook, index) => (
              <EndpointRow
                key={webhook.id}
                webhook={webhook}
                rows={rows}
                onSecret={setReveal}
                editKey={editKey(webhook)}
                isLast={index === webhooks.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}