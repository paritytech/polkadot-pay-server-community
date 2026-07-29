// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export type WebhookEndpointStatus = "enabled" | "disabled";
export type WebhookEventType =
  | "payment.created"
  | "payment.received"
  | "payment.settling"
  | "payment.confirming"
  | "payment.settled"
  | "payment.failed"
  | "payment.expired"
  | "payment.canceled"
  | "test.ping";

export type WebhookEndpointRecord = {
  id: string;
  merchant_id: string;
  url: string;
  events: string;
  secret_enc: string;
  status: WebhookEndpointStatus;
  created_at: number;
  deleted_at: number | null;
};

export type EventRecord = {
  id: string;
  merchant_id: string;
  type: WebhookEventType;
  payment_id: string | null;
  payload: string;
  created_at: number;
};

export type WebhookDeliveryRecord = {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: "pending" | "succeeded" | "failed";
  attempt_count: number;
  next_attempt_at: number;
  last_status_code: number | null;
  last_error: string | null;
  delivered_at: number | null;
  created_at: number;
};

export type DueWebhookDelivery = WebhookDeliveryRecord & {
  endpoint_url: string;
  endpoint_secret_enc: string;
  event_payload: string;
  event_type: WebhookEventType;
};
