// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/apiClient';
import { useHealthState } from '../lib/healthQuery';
import { cn } from '../lib/utils';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../stores/toastStore';
import type { Merchant, SignupResponse } from '../types/api';

type Tab = 'signin' | 'create';

export function AuthGate() {
  const signIn = useAuthStore((s) => s.signIn);
  const navigate = useNavigate();
  const { dotClass } = useHealthState();
  const [tab, setTab] = useState<Tab>('signin');
  const [keyInput, setKeyInput] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const signup = useMutation({
    mutationFn: (body: { name: string; signup_code: string }) =>
      apiFetch<SignupResponse>('/v1/accounts', { method: 'POST', body, auth: false }),
    onSuccess: (data) => {
      setSecret(data.api_key.secret);
    },
    onError: (error) => toast({ title: 'Could not create account', description: error.message, tone: 'error' }),
  });

  const signInKey = useMutation({
    mutationFn: async (apiKey: string) => {
      signIn(apiKey);
      try {
        return await apiFetch<Merchant>('/v1/account');
      } catch (error) {
        useAuthStore.getState().signOut();
        throw error;
      }
    },
    onSuccess: () => navigate({ to: '/payments' }),
    onError: (error) => {
      const message = error instanceof ApiError && error.status === 401 ? 'That API key is not valid.' : error.message;
      toast({ title: 'Sign in failed', description: message, tone: 'error' });
    },
  });

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <aside className="flex flex-col justify-between gap-10 bg-surface-container-inverted p-14 max-lg:py-10">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-[26px] w-[26px] flex-none place-items-center">
            <img src="/logo-symbol_light.svg" alt="" className="h-5 w-auto" />
          </span>
          <span className="font-display text-[20px] text-primary-inverted">PolkaPay</span>
        </div>

        <div className="flex max-w-[30ch] flex-col gap-5">
          <h2 className="font-display text-[40px] leading-[1.14] text-primary-inverted">Take a payment in four requests.</h2>
          <p className="text-[15px] leading-relaxed text-secondary-inverted text-pretty">
            Create a payment, show the QR, and we settle on chain and call your webhook when the money lands.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-tertiary-inverted">Network</span>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className={cn('dc-pulse h-1.5 w-1.5 rounded-full', dotClass)} />
            <code className="text-[13px] text-secondary-inverted">paseo-next-v2 · people chain reachable</code>
          </div>
        </div>
      </aside>

      <section className="flex items-center justify-center px-10 py-12">
        <div className="w-full max-w-[404px]">
          {secret ? (
            <SecretReveal
              secret={secret}
              copied={copied}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard unavailable */
                }
              }}
              onContinue={() => {
                signIn(secret);
                navigate({ to: '/payments' });
              }}
            />
          ) : (
            <LoginForm
              tab={tab}
              onTabChange={setTab}
              keyInput={keyInput}
              onKeyInput={setKeyInput}
              signupName={signupName}
              onSignupName={setSignupName}
              signupCode={signupCode}
              onSignupCode={setSignupCode}
              onSignIn={() => keyInput.trim() && signInKey.mutate(keyInput.trim())}
              signInPending={signInKey.isPending}
              onCreateAccount={() =>
                !signup.isPending &&
                signup.mutate({ name: signupName.trim(), signup_code: signupCode })
              }
              createPending={signup.isPending}
            />
          )}
        </div>
      </section>
    </div>
  );
}

interface LoginFormProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  keyInput: string;
  onKeyInput: (value: string) => void;
  signupName: string;
  onSignupName: (value: string) => void;
  signupCode: string;
  onSignupCode: (value: string) => void;
  onSignIn: () => void;
  signInPending: boolean;
  onCreateAccount: () => void;
  createPending: boolean;
}

function LoginForm({
  tab,
  onTabChange,
  keyInput,
  onKeyInput,
  signupName,
  onSignupName,
  signupCode,
  onSignupCode,
  onSignIn,
  signInPending,
  onCreateAccount,
  createPending,
}: LoginFormProps) {
  const onSignInTab = tab === 'signin';
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] leading-tight text-primary">
          {onSignInTab ? 'Welcome back' : 'Create an account'}
        </h1>
        <p className="text-sm leading-relaxed text-secondary text-pretty">
          {onSignInTab
            ? 'Sign in with a secret key from your server environment.'
            : 'You will get one secret key, shown exactly once.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-nested bg-action-secondary p-1">
        <button
          type="button"
          onClick={() => onTabChange('signin')}
          className={cn(
            'cursor-pointer rounded-small px-3 py-1.5 text-sm font-medium transition-colors',
            onSignInTab ? 'bg-surface-container text-primary shadow-1' : 'bg-transparent text-secondary',
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => onTabChange('create')}
          className={cn(
            'cursor-pointer rounded-small px-3 py-1.5 text-sm font-medium transition-colors',
            !onSignInTab ? 'bg-surface-container text-primary shadow-1' : 'bg-transparent text-secondary',
          )}
        >
          Create account
        </button>
      </div>

      {onSignInTab ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSignIn();
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="apikey" className="text-sm font-medium text-primary">API key</label>
            <textarea
              id="apikey"
              value={keyInput}
              onChange={(event) => onKeyInput(event.target.value)}
              rows={3}
              placeholder="payment_processor_sk_…"
              className="w-full resize-y rounded-nested border bg-surface-container px-3 py-2 font-mono text-sm leading-relaxed text-primary outline-none placeholder:text-tertiary"
            />
            <p className="text-sm text-tertiary">
              Sent as an <code className="font-mono">Authorization: Bearer</code> header on every request.
            </p>
          </div>
          <button
            type="submit"
            disabled={signInPending || !keyInput.trim()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-small bg-action-secondary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-action-secondary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signInPending ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateAccount();
          }}
        >
          <div className="grid gap-1.5">
            <label htmlFor="mn" className="text-sm font-medium text-primary">Merchant name</label>
            <input
              id="mn"
              value={signupName}
              onChange={(event) => onSignupName(event.target.value)}
              placeholder="Acme Store"
              className="w-full rounded-nested border bg-surface-container px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="sc" className="text-sm font-medium text-primary">Signup code</label>
            <input
              id="sc"
              type="password"
              value={signupCode}
              onChange={(event) => onSignupCode(event.target.value)}
              placeholder="Required signup code"
              autoComplete="off"
              className="w-full rounded-nested border bg-surface-container px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary"
              required
            />
            <p className="text-sm text-tertiary">
              Shared secret configured on the backend (<code className="font-mono">SIGNUP_CODE</code>).
            </p>
          </div>
          <button
            type="submit"
            disabled={createPending || !signupName.trim() || !signupCode.trim()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-small bg-action-primary px-4 py-2 text-sm font-medium text-primary-inverted transition-colors hover:bg-action-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createPending ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}

interface SecretRevealProps {
  secret: string;
  copied: boolean;
  onCopy: () => void;
  onContinue: () => void;
}

function SecretReveal({ secret, copied, onCopy, onContinue }: SecretRevealProps) {
  return (
    <div className="dc-fade-in flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[30px] leading-tight text-primary">Save your API key</h1>
        <p className="text-sm leading-relaxed text-secondary text-pretty">
          This secret is shown once. Store it now — later reads only expose the last four characters.
        </p>
      </div>

      <div className="overflow-hidden rounded-nested bg-terminal">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <span className="text-xs font-semibold uppercase tracking-[0.05em] text-terminal-fg-muted">API key</span>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-terminal-action px-3 py-1.5 text-sm font-medium text-terminal-fg transition-colors hover:bg-terminal-action-hover"
          >
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto px-4 pb-4 pt-3 text-sm leading-relaxed text-terminal-fg">
          <code className="font-mono">{secret}</code>
        </pre>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-small bg-action-primary px-4 py-2 text-sm font-medium text-primary-inverted transition-colors hover:bg-action-primary-hover"
      >
        I saved it — continue
      </button>
    </div>
  );
}