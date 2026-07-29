// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Merchant } from '../../../types/api';
import { Button, CopyButton, DisplayIf, Field, Input } from '../../../components/ui';
import { formatDate, shortId } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { updateAccountName } from '../api/accountQueries';

interface AccountCardProps {
  merchant: Merchant;
}

export function AccountCard({ merchant }: AccountCardProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(merchant.name);
  const mutation = useMutation({
    mutationFn: updateAccountName,
    onSuccess: (updated) => {
      setName(updated.name);
      void queryClient.invalidateQueries({ queryKey: ['account'] });
      toast({ title: 'Merchant name saved', tone: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to update account',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  useEffect(() => {
    setName(merchant.name);
  }, [merchant.id, merchant.name]);

  const trimmedName = name.trim();
  const isDirty = trimmedName !== merchant.name;
  const canSave = Boolean(trimmedName) && isDirty && !mutation.isPending;

  return (
    <form
      className="overflow-hidden rounded-container bg-surface-container shadow-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        mutation.mutate(trimmedName);
      }}
    >
      <div className="p-6">
        <Field label="Display name" hint="Shown on hosted payment pages.">
          {(id) => (
            <Input
              id={id}
              className="max-w-96"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="organization"
              disabled={mutation.isPending}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap gap-x-12 gap-y-4 border-t border-divider px-6 py-5">
        <div className="grid min-w-0 gap-1.5">
          <span className="text-sm font-medium text-primary">Account ID</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm text-primary">{shortId(merchant.id)}</code>
            <CopyButton value={merchant.id} label="Copy ID" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-primary">Created</span>
          <span className="text-sm text-secondary">{formatDate(merchant.created_at)}</span>
        </div>
      </div>

      <DisplayIf when={isDirty}>
        <div className="flex items-center justify-end gap-2 border-t border-divider bg-surface-nested px-6 py-4">
          <span className="mr-auto text-sm text-secondary">Unsaved changes</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setName(merchant.name)}
            disabled={mutation.isPending}
          >
            Discard
          </Button>
          <Button type="submit" size="sm" disabled={!canSave}>
            Save
          </Button>
        </div>
      </DisplayIf>
    </form>
  );
}
