// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { appError } from "../../lib/errors";
import { eventId, webhookDeliveryId } from "../../lib/ids";
import type { Database } from "../../db/client";
import type { PaymentPublic } from "../payments/payments.types";
import {
  findEvent,
  insertEvent,
  insertWebhookDelivery,
  listEnabledWebhookEndpointsForType,
  listEventDeliverySummaries,
  listEvents,
} from "../webhooks/webhooks.repo";
import type { EventDeliverySummary } from "../webhooks/webhooks.repo";
import type { WebhookEventType } from "../webhooks/webhooks.types";

export type EventPayloadObject =
  | PaymentPublic
  | { object: "test.ping"; message: string };

type SerializedEventDelivery = {
  id: string;
  endpoint_id: string;
  status: "pending" | "succeeded" | "failed";
  attempt_count: number;
  last_status_code: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
};

type SerializedEvent = {
  id: string;
  object: "event";
  type: WebhookEventType;
  created_at: string;
  data: { object: EventPayloadObject };
  deliveries: SerializedEventDelivery[];
};

type EventsListResponse = {
  object: "list";
  data: SerializedEvent[];
  has_more: boolean;
};

type ParsedEventPayload = {
  id: string;
  object: "event";
  type: WebhookEventType;
  created_at: string;
  data: { object: EventPayloadObject };
};

const WEBHOOK_EVENT_TYPES: Record<WebhookEventType, true> = {
  "payment.created": true,
  "payment.received": true,
  "payment.settling": true,
  "payment.confirming": true,
  "payment.settled": true,
  "payment.failed": true,
  "payment.expired": true,
  "payment.canceled": true,
  "test.ping": true,
};

function parseEventPayload(payload: string): ParsedEventPayload {
  const parsed = JSON.parse(payload) as Partial<ParsedEventPayload> & {
    data?: { object?: EventPayloadObject };
  };
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.id !== "string" ||
    parsed.object !== "event" ||
    typeof parsed.type !== "string" ||
    WEBHOOK_EVENT_TYPES[parsed.type as WebhookEventType] !== true ||
    typeof parsed.created_at !== "string" ||
    typeof parsed.data !== "object" ||
    parsed.data === null ||
    typeof parsed.data.object !== "object" ||
    parsed.data.object === null ||
    Array.isArray(parsed.data.object)
  ) {
    throw new Error("Invalid event payload.");
  }
  return parsed as ParsedEventPayload;
}

export class EventsService {
  async emit(
    db: Database,
    merchantId: string,
    type: WebhookEventType,
    dataObject: EventPayloadObject,
    paymentId: string | null,
  ): Promise<string> {
    const createdAt = Date.now();
    const id = eventId();
    const payload = JSON.stringify({
      id,
      object: "event",
      type,
      created_at: new Date(createdAt).toISOString(),
      data: { object: dataObject },
    });

    await insertEvent(db, {
      id,
      merchant_id: merchantId,
      type,
      payment_id: paymentId,
      payload,
      created_at: createdAt,
    });

    for (const endpoint of await listEnabledWebhookEndpointsForType(db, merchantId, type)) {
      await insertWebhookDelivery(db, {
        id: webhookDeliveryId(),
        event_id: id,
        endpoint_id: endpoint.id,
        status: "pending",
        attempt_count: 0,
        next_attempt_at: createdAt,
        last_status_code: null,
        last_error: null,
        delivered_at: null,
        created_at: createdAt,
      });
    }

    return id;
  }

  async list(
    db: Database,
    merchantId: string,
    input: { type?: WebhookEventType; limit: number; startingAfter?: string },
  ): Promise<EventsListResponse> {
    const rows = await listEvents(db, merchantId, {
      type: input.type,
      limit: input.limit,
      startingAfter: input.startingAfter,
    });

    const data: SerializedEvent[] = [];
    for (const event of rows.slice(0, input.limit)) {
      data.push(await this.loadEvent(db, event));
    }

    return { object: "list", data, has_more: rows.length > input.limit };
  }

  async get(db: Database, merchantId: string, eventId: string): Promise<SerializedEvent> {
    const event = await findEvent(db, merchantId, eventId);
    if (!event) {
      throw appError(404, "not_found_error", "event_not_found", "Event not found.");
    }
    return this.loadEvent(db, event);
  }

  async resend(db: Database, merchantId: string, eventId: string): Promise<SerializedEvent> {
    const event = await findEvent(db, merchantId, eventId);
    if (!event) {
      throw appError(404, "not_found_error", "event_not_found", "Event not found.");
    }

    const parsed = parseEventPayload(event.payload);
    const now = Date.now();
    for (const endpoint of await listEnabledWebhookEndpointsForType(db, merchantId, parsed.type)) {
      await insertWebhookDelivery(db, {
        id: webhookDeliveryId(),
        event_id: event.id,
        endpoint_id: endpoint.id,
        status: "pending",
        attempt_count: 0,
        next_attempt_at: now,
        last_status_code: null,
        last_error: null,
        delivered_at: null,
        created_at: now,
      });
    }

    return this.loadEvent(db, event);
  }

  private async loadEvent(db: Database, event: { id: string; payload: string }): Promise<SerializedEvent> {
    return this.serializeEvent(event, await listEventDeliverySummaries(db, event.id));
  }

  private serializeEvent(
    event: { payload: string },
    deliveries: EventDeliverySummary[],
  ): SerializedEvent {
    const parsed = parseEventPayload(event.payload);
    return {
      ...parsed,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        endpoint_id: delivery.endpoint_id,
        status: delivery.status,
        attempt_count: delivery.attempt_count,
        last_status_code: delivery.last_status_code,
        last_error: delivery.last_error,
        delivered_at: delivery.delivered_at ? new Date(delivery.delivered_at).toISOString() : null,
        created_at: new Date(delivery.created_at).toISOString(),
      })),
    };
  }
}
