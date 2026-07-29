// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { CreatePaymentBody } from '../../../types/api';
import { Button, Card, DisplayIf, Field, Input } from '../../../components/ui';
import { ApiError } from '../../../lib/apiClient';
import { cn } from '../../../lib/utils';
import { toast } from '../../../stores/toastStore';
import { createPayment } from '../api/paymentQueries';

const EXPIRY_CHOICES = [
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.param ? `${error.param}: ${error.message}` : error.message;
  if (error instanceof Error) return error.message;
  return 'Request failed.';
}

export function CreatePaymentPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const expiryLabelId = useId();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [expiresIn, setExpiresIn] = useState(900);
  const [isOptionalOpen, setIsOptionalOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: createPayment,
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast({ title: 'Payment created', tone: 'success' });
      navigate({ to: '/payments/$paymentId', params: { paymentId: payment.id } });
    },
    onError: (error) => {
      toast({ title: errorMessage(error), tone: 'error' });
    },
  });

  function submit() {
    const trimmedAmount = amount.trim();
    if (!trimmedAmount || mutation.isPending) return;
    const body: CreatePaymentBody = { amount: trimmedAmount, currency: 'CASH', expires_in: expiresIn };
    if (description.trim()) body.description = description.trim();
    if (reference.trim()) body.reference = reference.trim();
    if (displayName.trim()) body.display_name = displayName.trim();
    mutation.mutate(body);
  }

  return (
    <Card>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div>
          <h2 className="text-lg font-semibold leading-tight text-primary">Create payment</h2>
          <p className="mt-1.5 text-sm text-secondary">Currency is fixed to USD. Only amount is required.</p>
        </div>

        <div className="flex flex-wrap gap-5">
          <div className="min-w-[168px]">
            <Field label="Amount" hint="Up to 10000.00">
              {(id) => (
                <div className="flex items-center gap-2 rounded-nested border bg-surface-container px-3 py-2 transition-colors focus-within:border-link focus-within:outline focus-within:outline-1 focus-within:outline-offset-0 focus-within:[outline-color:var(--focus-ring)]">
                  <input
                    id={id}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="12.34"
                    required
                    className="w-[88px] border-none bg-transparent font-mono text-sm text-primary outline-none focus-visible:outline-none placeholder:text-tertiary"
                  />
                  <span className="text-xs font-semibold text-tertiary">USD</span>
                </div>
              )}
            </Field>
          </div>

          <div className="min-w-[220px] flex-1">
            <Field label="Description" hint="Shown to you, not the payer.">
              {(id) => (
                <Input
                  id={id}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Table 4 — drinks"
                />
              )}
            </Field>
          </div>

          <div className="grid min-w-[152px] gap-1.5" role="group" aria-labelledby={expiryLabelId}>
            <span id={expiryLabelId} className="text-sm font-medium text-primary">
              Expires in
            </span>
            <div className="flex gap-1 rounded-nested bg-action-secondary p-1">
              {EXPIRY_CHOICES.map((choice) => {
                const active = expiresIn === choice.seconds;
                return (
                  <button
                    key={choice.seconds}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setExpiresIn(choice.seconds)}
                    className={cn(
                      'flex-1 cursor-pointer rounded-small px-3 py-1.5 text-sm font-medium transition-colors',
                      active ? 'bg-surface-container text-primary shadow-1' : 'bg-transparent text-secondary',
                    )}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-tertiary">expires_in: {expiresIn}</p>
          </div>
        </div>

        <DisplayIf when={isOptionalOpen}>
          <div className="flex flex-wrap gap-5">
            <div className="min-w-[220px] flex-1">
              <Field label="Reference">
                {(id) => (
                  <Input
                    id={id}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="order_8812"
                    className="font-mono"
                  />
                )}
              </Field>
            </div>
            <div className="min-w-[220px] flex-1">
              <Field label="Display name" hint="Overrides the merchant name on the QR page.">
                {(id) => (
                  <Input
                    id={id}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Acme Store"
                  />
                )}
              </Field>
            </div>
          </div>
        </DisplayIf>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            aria-expanded={isOptionalOpen}
            onClick={() => setIsOptionalOpen((open) => !open)}
            className="cursor-pointer bg-transparent text-sm font-medium text-link transition-colors hover:text-link-hover"
          >
            {isOptionalOpen ? 'Hide reference and display name' : 'Add reference and display name'}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !amount.trim()}>
              {mutation.isPending ? 'Creating…' : 'Create payment'}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
