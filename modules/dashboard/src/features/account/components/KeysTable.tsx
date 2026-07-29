// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import type { ApiKey } from '../../../types/api';
import { Badge, Button, CopyIdButton, DisplayIf, EmptyState } from '../../../components/ui';
import { cn, formatDate, shortId } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { revokeApiKey } from '../api/accountQueries';

const ROW = 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_132px_108px] items-center gap-4';

interface KeysTableProps {
  keys: ApiKey[];
}

export function KeysTable({ keys }: KeysTableProps) {
  if (keys.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No keys yet"
        description="Mint one and your servers can start authenticating requests."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-container bg-surface-container shadow-1">
      <div role="table" aria-label="Secret keys">
        <div
          role="row"
          className={cn(
            ROW,
            'border-b border-divider px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-tertiary',
          )}
        >
          <span role="columnheader">Label</span>
          <span role="columnheader">Key</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
        {keys.map((key) => (
          <KeyRow key={key.id} apiKey={key} />
        ))}
      </div>
    </div>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const revoked = apiKey.revoked_at !== null;
  const name = apiKey.label ?? shortId(apiKey.id);

  const mutation = useMutation({
    mutationFn: () => revokeApiKey(apiKey.id),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'Key revoked', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to revoke key',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  return (
    <div role="row" className={cn(ROW, 'border-b border-divider p-4')}>
      <div role="cell" className="grid min-w-0 gap-1">
        <span className="truncate text-sm font-medium text-primary">{apiKey.label ?? '—'}</span>
        <code className="truncate font-mono text-xs text-tertiary">{shortId(apiKey.id)}</code>
      </div>

      <div role="cell" className="flex min-w-0 items-center gap-2">
        <code className="truncate font-mono text-sm text-secondary">payment_processor_sk_••••{apiKey.last4}</code>
        <CopyIdButton value={apiKey.id} label={`Copy ID for ${name}`} />
      </div>

      <div role="cell" className="grid min-w-0 justify-items-start gap-1">
        <Badge tone={revoked ? 'error' : 'success'}>{revoked ? 'revoked' : 'active'}</Badge>
        <span className="whitespace-nowrap text-xs text-tertiary">{formatDate(apiKey.created_at)}</span>
      </div>

      <div role="cell" className="flex justify-end">
        <DisplayIf when={!revoked}>
          <DisplayIf when={!confirming}>
            <Button
              variant="ghost"
              size="sm"
              className="text-secondary hover:text-error"
              aria-label={`Revoke ${name}`}
              onClick={() => setConfirming(true)}
            >
              Revoke
            </Button>
          </DisplayIf>
          <DisplayIf when={confirming}>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="px-2.5 text-secondary"
                onClick={() => setConfirming(false)}
                disabled={mutation.isPending}
              >
                No
              </Button>
              <Button
                variant="danger"
                size="sm"
                aria-label={`Confirm revoking ${name}`}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                Revoke
              </Button>
            </div>
          </DisplayIf>
        </DisplayIf>
      </div>
    </div>
  );
}
