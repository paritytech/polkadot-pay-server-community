// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/apiClient';
import type { ApiKey, ApiKeyWithSecret, ListResponse, Merchant } from '../../../types/api';

export const accountQueryOptions = queryOptions({
  queryKey: ['account'],
  queryFn: () => apiFetch<Merchant>('/v1/account'),
});

export const apiKeysQueryOptions = queryOptions({
  queryKey: ['api-keys'],
  queryFn: () => apiFetch<ListResponse<ApiKey>>('/v1/api_keys'),
});

export function createApiKey(label: string | null) {
  return apiFetch<ApiKeyWithSecret>('/v1/api_keys', { method: 'POST', body: { label } });
}

export function revokeApiKey(id: string) {
  return apiFetch<unknown>(`/v1/api_keys/${id}`, { method: 'DELETE' });
}

export function updateAccountName(name: string) {
  return apiFetch<Merchant>('/v1/account', { method: 'PATCH', body: { name } });
}
