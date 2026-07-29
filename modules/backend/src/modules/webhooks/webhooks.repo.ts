// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";

import type { DueWebhookDelivery, EventRecord, WebhookDeliveryRecord, WebhookEndpointRecord, WebhookEventType } from "./webhooks.types";

export type EventDeliverySummary = Pick<
  WebhookDeliveryRecord,
  "id" | "endpoint_id" | "status" | "attempt_count" | "last_status_code" | "last_error" | "delivered_at" | "created_at"
>;

type DeliverySummaryRow = EventDeliverySummary;
export async function createWebhookEndpoint(db: Database, row: WebhookEndpointRecord): Promise<void> {
  await db.execute(
    `INSERT INTO webhook_endpoints (
      id, merchant_id, url, events, secret_enc, status, created_at, deleted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.merchant_id, row.url, row.events, row.secret_enc, row.status, row.created_at, row.deleted_at],
  );
}

export async function listWebhookEndpoints(db: Database, merchantId: string): Promise<WebhookEndpointRecord[]> {
  return db.query<WebhookEndpointRecord>(
    `SELECT id, merchant_id, url, events, secret_enc, status, created_at, deleted_at
     FROM webhook_endpoints
     WHERE merchant_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [merchantId],
  );
}

export async function findWebhookEndpoint(
  db: Database,
  merchantId: string,
  endpointId: string,
): Promise<WebhookEndpointRecord | null> {
  return db.queryOne<WebhookEndpointRecord>(
    `SELECT id, merchant_id, url, events, secret_enc, status, created_at, deleted_at
     FROM webhook_endpoints
     WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [merchantId, endpointId],
  );
}

export async function listEnabledWebhookEndpointsForType(
  db: Database,
  merchantId: string,
  eventType: WebhookEventType,
): Promise<WebhookEndpointRecord[]> {
  const endpoints = await listWebhookEndpoints(db, merchantId);
  return endpoints.filter((endpoint) => {
    if (endpoint.status !== "enabled") {
      return false;
    }
    const events = JSON.parse(endpoint.events) as string[];
    return events.includes("*") || events.includes(eventType);
  });
}

export async function updateWebhookEndpointFields(
  db: Database,
  merchantId: string,
  endpointId: string,
  patch: { url?: string; events?: string; status?: "enabled" | "disabled"; secret_enc?: string },
): Promise<void> {
  const updates: string[] = [];
  const params: string[] = [merchantId, endpointId];
  if (patch.url !== undefined) {
    updates.push(`url = $${params.length + 1}`);
    params.push(patch.url);
  }
  if (patch.events !== undefined) {
    updates.push(`events = $${params.length + 1}`);
    params.push(patch.events);
  }
  if (patch.status !== undefined) {
    updates.push(`status = $${params.length + 1}`);
    params.push(patch.status);
  }
  if (patch.secret_enc !== undefined) {
    updates.push(`secret_enc = $${params.length + 1}`);
    params.push(patch.secret_enc);
  }
  if (updates.length === 0) {
    return;
  }
  await db.execute(`UPDATE webhook_endpoints SET ${updates.join(", ")} WHERE merchant_id = $1 AND id = $2`, params);
}

export async function softDeleteWebhookEndpoint(
  db: Database,
  merchantId: string,
  endpointId: string,
  deletedAt: number,
): Promise<void> {
  await db.execute(
    `UPDATE webhook_endpoints SET deleted_at = $3, status = 'disabled' WHERE merchant_id = $1 AND id = $2`,
    [merchantId, endpointId, deletedAt],
  );
}

export async function insertEvent(db: Database, row: EventRecord): Promise<void> {
  await db.execute(
    `INSERT INTO events (id, merchant_id, type, payment_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.merchant_id, row.type, row.payment_id, row.payload, row.created_at],
  );
}

export async function insertWebhookDelivery(db: Database, row: WebhookDeliveryRecord): Promise<void> {
  await db.execute(
    `INSERT INTO webhook_deliveries (
      id, event_id, endpoint_id, status, attempt_count, next_attempt_at,
      last_status_code, last_error, delivered_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      row.id,
      row.event_id,
      row.endpoint_id,
      row.status,
      row.attempt_count,
      row.next_attempt_at,
      row.last_status_code,
      row.last_error,
      row.delivered_at,
      row.created_at,
    ],
  );
}

export async function listEvents(
  db: Database,
  merchantId: string,
  input: { type?: string; limit: number; startingAfter?: string },
): Promise<EventRecord[]> {
  const params: Array<string | number> = [merchantId];
  const conditions = ["merchant_id = $1"];
  if (input.type) {
    params.push(input.type);
    conditions.push(`type = $${params.length}`);
  }
  if (input.startingAfter) {
    const cursor = await findEvent(db, merchantId, input.startingAfter);
    if (cursor) {
      params.push(cursor.created_at, cursor.created_at, cursor.id);
      const createdIndex = params.length - 2;
      const sameIndex = params.length - 1;
      const idIndex = params.length;
      conditions.push(`(created_at < $${createdIndex} OR (created_at = $${sameIndex} AND id < $${idIndex}))`);
    }
  }
  params.push(input.limit + 1);
  return db.query<EventRecord>(
    `
      SELECT id, merchant_id, type, payment_id, payload, created_at
      FROM events
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params,
  );
}

export async function findEvent(db: Database, merchantId: string, eventId: string): Promise<EventRecord | null> {
  return db.queryOne<EventRecord>(
    `SELECT id, merchant_id, type, payment_id, payload, created_at
     FROM events WHERE merchant_id = $1 AND id = $2 LIMIT 1`,
    [merchantId, eventId],
  );
}

export async function listEventDeliverySummaries(
  db: Database,
  eventId: string,
): Promise<DeliverySummaryRow[]> {
  return db.query<DeliverySummaryRow>(
    `SELECT id, endpoint_id, status, attempt_count, last_status_code, last_error, delivered_at, created_at
     FROM webhook_deliveries
     WHERE event_id = $1
     ORDER BY created_at DESC`,
    [eventId],
  );
}

export async function listDueWebhookDeliveries(db: Database, now: number, limit: number): Promise<DueWebhookDelivery[]> {
  return db.query<DueWebhookDelivery>(
    `SELECT
      d.id, d.event_id, d.endpoint_id, d.status, d.attempt_count, d.next_attempt_at,
      d.last_status_code, d.last_error, d.delivered_at, d.created_at,
      w.url AS endpoint_url,
      w.secret_enc AS endpoint_secret_enc,
      e.payload AS event_payload,
      e.type AS event_type
     FROM webhook_deliveries d
     JOIN webhook_endpoints w ON w.id = d.endpoint_id
     JOIN events e ON e.id = d.event_id
     WHERE d.status = 'pending'
       AND d.next_attempt_at <= $1
       AND w.deleted_at IS NULL
     ORDER BY d.next_attempt_at ASC, d.created_at ASC
     LIMIT $2`,
    [now, limit],
  );
}

export async function markWebhookDeliverySuccess(
  db: Database,
  deliveryId: string,
  statusCode: number,
  deliveredAt: number,
): Promise<void> {
  await db.execute(
    `UPDATE webhook_deliveries
     SET status = 'succeeded', attempt_count = attempt_count + 1, last_status_code = $2,
         last_error = NULL, delivered_at = $3
     WHERE id = $1`,
    [deliveryId, statusCode, deliveredAt],
  );
}

export async function markWebhookDeliveryRetry(
  db: Database,
  deliveryId: string,
  statusCode: number | null,
  lastError: string,
  nextAttemptAt: number,
): Promise<void> {
  await db.execute(
    `UPDATE webhook_deliveries
     SET attempt_count = attempt_count + 1, last_status_code = $2, last_error = $3, next_attempt_at = $4
     WHERE id = $1`,
    [deliveryId, statusCode, lastError, nextAttemptAt],
  );
}

export async function markWebhookDeliveryFailed(
  db: Database,
  deliveryId: string,
  statusCode: number | null,
  lastError: string,
): Promise<void> {
  await db.execute(
    `UPDATE webhook_deliveries
     SET status = 'failed', attempt_count = attempt_count + 1, last_status_code = $2, last_error = $3
     WHERE id = $1`,
    [deliveryId, statusCode, lastError],
  );
}
