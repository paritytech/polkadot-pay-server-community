// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useAuthStore } from '../stores/authStore';
import type { ApiErrorBody } from '../types/api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly param?: string;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error?.message || fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code || 'unknown';
    this.type = body?.error?.type || 'api_error';
    this.param = body?.error?.param;
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = options;
  const finalHeaders: Record<string, string> = { ...headers };

  if (body !== undefined) finalHeaders['content-type'] = 'application/json';
  if (auth) {
    const apiKey = useAuthStore.getState().apiKey;
    if (apiKey) finalHeaders.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, parsed, `Request failed (${response.status}).`);
  }
  return parsed as T;
}
