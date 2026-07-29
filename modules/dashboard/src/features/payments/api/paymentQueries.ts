// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/apiClient';
import type { CreatePaymentBody, ListResponse, Payment, PaymentStatus } from '../../../types/api';

export function paymentsQueryOptions(params: { status?: PaymentStatus }) {
  return queryOptions({
    queryKey: ['payments', params] as const,
    queryFn: () =>
      apiFetch<ListResponse<Payment>>(
        `/v1/payments?limit=25${params.status ? `&status=${params.status}` : ''}`,
      ),
  });
}

export function paymentQueryOptions(id: string) {
  return queryOptions({
    queryKey: ['payment', id] as const,
    queryFn: () => apiFetch<Payment>(`/v1/payments/${id}`),
  });
}

export function createPayment(body: CreatePaymentBody) {
  return apiFetch<Payment>('/v1/payments', { method: 'POST', body });
}

export function cancelPayment(id: string) {
  return apiFetch<Payment>(`/v1/payments/${id}/cancel`, { method: 'POST' });
}
