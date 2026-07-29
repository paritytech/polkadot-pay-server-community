// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/apiClient';
import type {
  EventEnvelope,
  ListResponse,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookStatus,
} from '../../../types/api';
export const webhooksQueryOptions = queryOptions({
  queryKey: ['webhooks'] as const,
  queryFn: () => apiFetch<ListResponse<WebhookEndpoint>>('/v1/webhook_endpoints'),
});

export const eventsQueryOptions = queryOptions({
  queryKey: ['events', 'recent'] as const,
  queryFn: () => apiFetch<ListResponse<EventEnvelope>>('/v1/events?limit=25'),
});

export function createWebhook(body: { url: string; events: string[] }) {
  return apiFetch<WebhookEndpointWithSecret>('/v1/webhook_endpoints', { method: 'POST', body });
}

export function updateWebhook(id: string, body: { url?: string; events?: string[]; status?: WebhookStatus }) {
  return apiFetch<WebhookEndpoint>(`/v1/webhook_endpoints/${id}`, { method: 'PATCH', body });
}

export function deleteWebhook(id: string) {
  return apiFetch<unknown>(`/v1/webhook_endpoints/${id}`, { method: 'DELETE' });
}

export function rotateWebhookSecret(id: string) {
  return apiFetch<WebhookEndpointWithSecret>(`/v1/webhook_endpoints/${id}/rotate_secret`, {
    method: 'POST',
  });
}

export function testWebhook(id: string) {
  return apiFetch<unknown>(`/v1/webhook_endpoints/${id}/test`, { method: 'POST' });
}

export function resendEvent(id: string) {
  return apiFetch<EventEnvelope>(`/v1/events/${id}/resend`, { method: 'POST' });
}
