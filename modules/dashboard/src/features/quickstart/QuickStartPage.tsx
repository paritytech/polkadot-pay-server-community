// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, KeyRound } from 'lucide-react';
import { createApiKey } from '../account/api/accountQueries';
import { Badge, Button, Input } from '../../components/ui';
import { useHealthState } from '../../lib/healthQuery';
import { cn } from '../../lib/utils';
import { toast } from '../../stores/toastStore';
import { QUICK_START_STEPS, useQuickStartStore } from './useQuickStartProgress';
import { QuickStartStepCard } from './QuickStartStepCard';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8788').replace(/\/$/, '');

export function QuickStartPage() {
  const doneMap = useQuickStartStore((s) => s.done);
  const toggle = useQuickStartStore((s) => s.toggle);
  const doneCount = Object.values(doneMap).filter(Boolean).length;
  const pct = (doneCount / QUICK_START_STEPS) * 100;
  const { state, responding } = useHealthState();

  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [amount, setAmount] = useState('1.00');
  const [description, setDescription] = useState('First test');

  const mintKey = useMutation({
    mutationFn: () => createApiKey(null),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setApiKey(created.secret);
    },
    onError: (error) => {
      toast({
        title: 'Unable to mint API key',
        description: error instanceof Error ? error.message : 'Request failed.',
        tone: 'error',
      });
    },
  });

  const exportedKey = apiKey ?? 'payment_processor_sk_…';
  const trimmedAmount = amount.trim() || '1.00';
  const trimmedDescription = description.trim() || 'First test';

  return (
    <div className="dc-fade-in grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-[1.15] text-primary">Quick Start</h1>
          <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-secondary text-pretty">
            Take your first payment end to end. Every step is a single request against your local backend.
          </p>
        </div>
        <div className="grid min-w-[160px] justify-items-end gap-2">
          <span className="text-sm font-medium text-primary">
            {doneCount} of {QUICK_START_STEPS} steps done
          </span>
          <span aria-hidden className="block h-1 w-40 overflow-hidden rounded-full bg-action-secondary">
            <span className="dc-progress-fill block h-full bg-success" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-12 gap-y-4 rounded-container bg-surface-container p-5 px-6 shadow-1">
        <Field label="Backend">
          <code className="text-sm text-primary">{API_BASE}</code>
        </Field>
        <Field label="Network">
          <code className="text-sm text-primary">paseo-next-v2</code>
        </Field>
        <Field label="Auth">
          <code className="text-sm text-primary">Authorization: Bearer</code>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', responding ? 'bg-success' : 'bg-error')} />
          <span className="text-sm text-secondary">
            {responding ? '/healthz responding' : '/healthz unreachable'}
          </span>
          <span className="sr-only">backend state: {state}</span>
        </div>
      </div>

      <div className="grid gap-4">
        <QuickStartStepCard
          index={1}
          done={Boolean(doneMap[1])}
          onToggle={() => toggle(1)}
          title="Create a merchant account"
          description={
            <>
              Uses the <code className="font-mono text-sm">SIGNUP_CODE</code> from your{' '}
              <code className="font-mono text-sm">.env</code>. The response contains your only copy of the secret key.
            </>
          }
          code={`curl -sS -X POST ${API_BASE}/v1/accounts \\\n  -H 'content-type: application/json' \\\n  --data '{"name":"Acme Store","signup_code":"…"}'`}
          footer={
            <p className="text-sm text-tertiary">
              Returns <code className="font-mono text-sm">account</code> and{' '}
              <code className="font-mono text-sm">api_key.secret</code>.
            </p>
          }
        />
        <QuickStartStepCard
          index={2}
          done={Boolean(doneMap[2])}
          onToggle={() => toggle(2)}
          title="Store the key on your server"
          description="It is never retrievable again — later reads only expose the last four characters. Keep it out of client code and version control."
          code={`export API_KEY="${exportedKey}"`}
          controls={
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => mintKey.mutate()}
                disabled={mintKey.isPending}
              >
                {apiKey ? <Check aria-hidden className="h-4 w-4" /> : <KeyRound aria-hidden className="h-4 w-4" />}
                {mintKey.isPending ? 'Minting…' : apiKey ? 'Minted a live key' : 'Mint a real key for me'}
              </Button>
              {apiKey ? (
                <span className="text-sm text-tertiary">Live secret, shown once — copy it before you leave this page.</span>
              ) : null}
            </div>
          }
        />
        <QuickStartStepCard
          index={3}
          done={Boolean(doneMap[3])}
          onToggle={() => toggle(3)}
          title="Create a payment"
          description={
            <>
              Currency is fixed to USD. You get back a hosted{' '}
              <code className="font-mono text-sm">payment_url</code> and a QR deeplink.
            </>
          }
          controls={
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs text-tertiary">Amount (USD)</span>
                <Input
                  className="w-32"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="1.00"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs text-tertiary">Description</span>
                <Input
                  className="w-64"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="First test"
                />
              </label>
            </div>
          }
          code={`curl -sS -X POST ${API_BASE}/v1/payments \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H 'content-type: application/json' \\\n  --data '{"amount":"${trimmedAmount}","description":"${trimmedDescription}","expires_in":900}'`}
        />
        <QuickStartStepCard
          index={4}
          done={Boolean(doneMap[4])}
          onToggle={() => toggle(4)}
          title="Show the QR and watch the status"
          description={
            <>
              Open <code className="font-mono text-sm">payment_url</code> in a browser and scan it with a funded wallet.
              The public status endpoint needs no auth.
            </>
          }
          code={`curl -sS ${API_BASE}/public/payments/$PAYMENT_ID/status`}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-tertiary">Status moves</span>
              <Badge tone="warning">pending</Badge>
              <span className="text-sm text-tertiary">→</span>
              <Badge tone="success">received</Badge>
              <span className="text-sm text-tertiary">→</span>
              <Badge tone="warning">settling</Badge>
              <span className="text-sm text-tertiary">→</span>
              <Badge tone="warning">confirming</Badge>
              <span className="text-sm text-tertiary">→</span>
              <Badge tone="success">settled</Badge>
            </div>
          }
        />
        <QuickStartStepCard
          index={5}
          done={Boolean(doneMap[5])}
          onToggle={() => toggle(5)}
          title="Get told instead of polling"
          description="Register a webhook endpoint and subscribe to the events you care about. We retry failures with backoff for up to 3 days."
          code=""
          footer={
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                {['payment.received', 'payment.settled', 'payment.failed', 'payment.expired'].map((evt) => (
                  <code key={evt} className="rounded-full bg-surface-nested px-2.5 py-1 text-xs text-secondary">
                    {evt}
                  </code>
                ))}
              </div>
              <Link
                to="/webhooks"
                className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-small bg-action-secondary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-action-secondary-hover"
              >
                Add an endpoint
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-tertiary">{label}</span>
      {children}
    </div>
  );
}
