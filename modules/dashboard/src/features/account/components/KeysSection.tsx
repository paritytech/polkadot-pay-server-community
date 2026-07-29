// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ApiKey } from '../../../types/api';
import { Button, DisplayIf, SecretRevealCard } from '../../../components/ui';
import { plural } from '../../../lib/utils';
import { KeysTable } from './KeysTable';
import { MintKeyForm } from './MintKeyForm';

interface KeysSectionProps {
  keys: ApiKey[];
}

interface Reveal {
  secret: string;
  label: string | null;
}

export function KeysSection({ keys }: KeysSectionProps) {
  const [minting, setMinting] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const activeCount = keys.filter((key) => key.revoked_at === null).length;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-primary">Secret keys</h2>
          <p className="mt-1.5 text-sm text-secondary">
            {plural(activeCount, 'active key')} · shown once at creation, never retrievable later.
          </p>
        </div>
        <DisplayIf when={!minting}>
          <Button onClick={() => setMinting(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Mint key
          </Button>
        </DisplayIf>
      </div>

      <DisplayIf when={minting}>
        <MintKeyForm
          onCancel={() => setMinting(false)}
          onMinted={(secret, label) => {
            setMinting(false);
            setReveal({ secret, label });
          }}
        />
      </DisplayIf>

      {reveal === null ? null : (
        <SecretRevealCard
          title="Copy your secret key now"
          description={`This is the only time it will be shown.${reveal.label ? ` Label: ${reveal.label}.` : ''}`}
          label="API key"
          secret={reveal.secret}
          onDismiss={() => setReveal(null)}
        />
      )}

      <KeysTable keys={keys} />

      <p className="text-sm leading-relaxed text-tertiary">
        Revoking takes effect immediately — requests signed with that key start failing with{' '}
        <code className="font-mono">401 invalid_api_key</code>.
      </p>
    </section>
  );
}
