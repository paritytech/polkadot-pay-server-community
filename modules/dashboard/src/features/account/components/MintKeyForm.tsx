// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input } from '../../../components/ui';
import { toast } from '../../../stores/toastStore';
import { createApiKey } from '../api/accountQueries';

interface MintKeyFormProps {
  onCancel: () => void;
  onMinted: (secret: string, label: string | null) => void;
}

export function MintKeyForm({ onCancel, onMinted }: MintKeyFormProps) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');

  const mutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (apiKey) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      onMinted(apiKey.secret, apiKey.label);
    },
    onError: (error) => {
      toast({
        title: 'Unable to mint API key',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  return (
    <form
      className="grid gap-5 rounded-container bg-surface-container p-6 shadow-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const trimmed = label.trim();
        mutation.mutate(trimmed ? trimmed : null);
      }}
    >
      <Field label="Label" hint="Optional, but it is how you will recognise this key later.">
        {(id) => (
          <Input
            id={id}
            className="max-w-96"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCancel();
            }}
            placeholder="Production deploy"
            autoComplete="off"
            disabled={mutation.isPending}
          />
        )}
      </Field>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          Mint key
        </Button>
      </div>
    </form>
  );
}
