// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiFetch } from './apiClient';

/** GET /healthz — public, so the login screen can report reachability too. */
export interface Health {
  ok: true;
  chain: 'connected' | 'reconnecting';
  pending_subscriptions: number;
}

export const healthQueryOptions = queryOptions({
  queryKey: ['health'] as const,
  queryFn: () => apiFetch<Health>('/healthz', { auth: false }),
  staleTime: 15_000,
  refetchInterval: 30_000,
  retry: false,
});

export type HealthState = 'connected' | 'reconnecting' | 'unreachable' | 'checking';

const DOT: Record<HealthState, string> = {
  connected: 'bg-success',
  reconnecting: 'bg-warning',
  unreachable: 'bg-error',
  checking: 'bg-tertiary',
};

/** Live backend state — never assumed; an unanswered /healthz reads as unreachable. */
export function useHealthState(): { state: HealthState; dotClass: string; responding: boolean } {
  const { data, isError } = useQuery(healthQueryOptions);
  const state: HealthState = data ? data.chain : isError ? 'unreachable' : 'checking';
  return { state, dotClass: DOT[state], responding: Boolean(data) };
}
