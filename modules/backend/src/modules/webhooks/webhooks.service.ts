// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { appError } from "../../lib/errors";
import { seal } from "../../lib/crypto";
import { webhookEndpointId } from "../../lib/ids";
import type { Database } from "../../db/client";
import { EventsService } from "../events/events.service";
import {
  createWebhookEndpoint,
  findWebhookEndpoint,
  listWebhookEndpoints,
  softDeleteWebhookEndpoint,
  updateWebhookEndpointFields,
} from "./webhooks.repo";
import type { WebhookEndpointRecord, WebhookEndpointStatus } from "./webhooks.types";

export type WebhookEndpointResponse = {
  id: string;
  object: "webhook_endpoint";
  url: string;
  events: string[];
  status: WebhookEndpointStatus;
  created_at: string;
};

export type WebhookEndpointSecretResponse = WebhookEndpointResponse & {
  secret: string;
};

export type WebhookEndpointListResponse = {
  object: "list";
  data: WebhookEndpointResponse[];
  has_more: false;
};

export type WebhookTestResponse = {
  id: string;
  event_id: string;
  queued_at: string;
};

type CreateWebhookEndpointInput = {
  url: string;
  events?: string[];
};

type UpdateWebhookEndpointInput = {
  url?: string;
  events?: string[];
  status?: WebhookEndpointStatus;
};

function parseEvents(events: string[] | undefined): string[] {
  const value = events ?? ["*"];
  if (value.length === 0) {
    throw appError(400, "invalid_request_error", "invalid_events", "At least one event must be selected.", "events");
  }
  return value;
}

function assertHttpUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw appError(400, "invalid_request_error", "invalid_url", "Webhook URL must use http or https.", "url");
  }
}

function endpointResponse(endpoint: WebhookEndpointRecord): WebhookEndpointResponse {
  return {
    id: endpoint.id,
    object: "webhook_endpoint",
    url: endpoint.url,
    events: JSON.parse(endpoint.events) as string[],
    status: endpoint.status,
    created_at: new Date(endpoint.created_at).toISOString(),
  };
}

function endpointWithSecret(endpoint: WebhookEndpointRecord, secret: string): WebhookEndpointSecretResponse {
  return { ...endpointResponse(endpoint), secret };
}

function newEndpointSecret(): string {
  return `whsec_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
}

export class WebhooksService {
  constructor(private readonly events: EventsService) {}

  async createEndpoint(
    db: Database,
    merchantId: string,
    input: CreateWebhookEndpointInput,
  ): Promise<WebhookEndpointSecretResponse> {
    assertHttpUrl(input.url);
    const secret = newEndpointSecret();
    const now = Date.now();
    const endpoint: WebhookEndpointRecord = {
      id: webhookEndpointId(),
      merchant_id: merchantId,
      url: input.url,
      events: JSON.stringify(parseEvents(input.events)),
      secret_enc: seal(new TextEncoder().encode(secret)),
      status: "enabled",
      created_at: now,
      deleted_at: null,
    };
    await createWebhookEndpoint(db, endpoint);
    return endpointWithSecret(endpoint, secret);
  }

  async listEndpoints(db: Database, merchantId: string): Promise<WebhookEndpointListResponse> {
    const data = (await listWebhookEndpoints(db, merchantId)).map(endpointResponse);
    return { object: "list", data, has_more: false };
  }

  async updateEndpoint(
    db: Database,
    merchantId: string,
    endpointId: string,
    input: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointResponse> {
    const existing = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!existing) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    if (input.url !== undefined) {
      assertHttpUrl(input.url);
    }
    await updateWebhookEndpointFields(db, merchantId, endpointId, {
      url: input.url,
      events: input.events !== undefined ? JSON.stringify(parseEvents(input.events)) : undefined,
      status: input.status,
    });
    const updated = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!updated) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    return endpointResponse(updated);
  }

  async deleteEndpoint(db: Database, merchantId: string, endpointId: string): Promise<void> {
    const existing = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!existing) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    await softDeleteWebhookEndpoint(db, merchantId, endpointId, Date.now());
  }

  async rotateSecret(
    db: Database,
    merchantId: string,
    endpointId: string,
  ): Promise<WebhookEndpointSecretResponse> {
    const existing = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!existing) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    const secret = newEndpointSecret();
    await updateWebhookEndpointFields(db, merchantId, endpointId, {
      secret_enc: seal(new TextEncoder().encode(secret)),
    });
    const updated = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!updated) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    return endpointWithSecret(updated, secret);
  }

  async sendTest(db: Database, merchantId: string, endpointId: string): Promise<WebhookTestResponse> {
    const existing = await findWebhookEndpoint(db, merchantId, endpointId);
    if (!existing) {
      throw appError(404, "not_found_error", "webhook_endpoint_not_found", "Webhook endpoint not found.");
    }
    const queuedAt = Date.now();
    const eventId = await this.events.emit(
      db,
      merchantId,
      "test.ping",
      { object: "test.ping", message: `Webhook test for ${existing.url}` },
      null,
    );
    return { id: endpointId, event_id: eventId, queued_at: new Date(queuedAt).toISOString() };
  }
}
