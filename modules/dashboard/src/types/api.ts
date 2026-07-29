// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export type PaymentStatus =
  | 'pending'
  | 'received'
  | 'settling'
  | 'confirming'
  | 'settled'
  | 'expired'
  | 'canceled'
  | 'failed';
export type WebhookStatus = 'enabled' | 'disabled';
export type DeliveryStatus = 'pending' | 'succeeded' | 'failed';
export type WebhookEventType =
  | 'payment.created'
  | 'payment.received'
  | 'payment.settling'
  | 'payment.confirming'
  | 'payment.settled'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.canceled'
  | 'test.ping';

export interface Merchant {
  id: string;
  name: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  object: 'api_key';
  label: string | null;
  last4: string;
  created_at: string;
  revoked_at: string | null;
}

export interface ApiKeyWithSecret extends ApiKey {
  secret: string;
}

export interface SignupResponse {
  account: Merchant;
  api_key: ApiKeyWithSecret;
}

export interface PaymentPaid {
  amount: string;
  coin_count: number;
  payer_timestamp_ms: number;
}

/** v1 settlement modality: per-coin bearer-coin claims. Future modalities join a union discriminated on `version`. */
export interface PaymentSettlementV1 {
  version: 1;
  claim_tx_hash: string | null;
  claim_tx_hashes: string[];
  claim_last_error: string | null;
  claim_attempts: number;
  claim_max_attempts: number;
  claimed_at: string | null;
}

export interface Payment {
  id: string;
  object: 'payment';
  status: PaymentStatus;
  amount: string;
  currency: 'CASH';
  description: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  display_name: string | null;
  payment_url: string;
  qr: { deeplink: string; png: string; svg: string };
  settlement: PaymentSettlementV1;
  paid: PaymentPaid | null;
  created_at: string;
  expires_at: string;
  received_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
}

export interface CreatePaymentBody {
  amount: string;
  currency?: 'CASH';
  description?: string | null;
  reference?: string | null;
  metadata?: Record<string, unknown>;
  display_name?: string | null;
  expires_in?: number;
}

export interface WebhookEndpoint {
  id: string;
  object: 'webhook_endpoint';
  url: string;
  events: string[];
  status: WebhookStatus;
  created_at: string;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secret: string;
}

export interface EventDelivery {
  id: string;
  endpoint_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface EventEnvelope {
  id: string;
  object: 'event';
  type: WebhookEventType;
  created_at: string;
  data: { object: unknown };
  deliveries: EventDelivery[];
}

export interface ListResponse<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
}

export interface ApiErrorBody {
  error: {
    type: string;
    code: string;
    message: string;
    param?: string;
  };
}
