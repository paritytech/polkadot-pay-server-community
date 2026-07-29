// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "../../types";
import { errorSchema, isoDateTimeSchema } from "../api/api.schema";
import { EventsService } from "../events/events.service";
import { WebhooksService } from "./webhooks.service";
import {
  createWebhookEndpointBodySchema,
  updateWebhookEndpointBodySchema,
  webhookEndpointParamsSchema,
  webhookEndpointSchema,
  webhookEndpointSecretSchema,
  webhookEndpointsListSchema,
} from "./webhooks.schema";

const security = [{ bearerAuth: [] }];

const createRouteDef = createRoute({
  method: "post",
  path: "/webhook_endpoints",
  tags: ["Webhooks"],
  summary: "Create a webhook endpoint",
  security,
  request: { body: { required: true, content: { "application/json": { schema: createWebhookEndpointBodySchema } } } },
  responses: {
    201: { description: "Created endpoint", content: { "application/json": { schema: webhookEndpointSecretSchema } } },
    400: { description: "Invalid request", content: { "application/json": { schema: errorSchema } } },
  },
});

const listRouteDef = createRoute({
  method: "get",
  path: "/webhook_endpoints",
  tags: ["Webhooks"],
  summary: "List webhook endpoints",
  security,
  responses: {
    200: { description: "Webhook endpoints", content: { "application/json": { schema: webhookEndpointsListSchema } } },
  },
});

const patchRouteDef = createRoute({
  method: "patch",
  path: "/webhook_endpoints/{id}",
  tags: ["Webhooks"],
  summary: "Update a webhook endpoint",
  security,
  request: {
    params: webhookEndpointParamsSchema,
    body: { required: true, content: { "application/json": { schema: updateWebhookEndpointBodySchema } } },
  },
  responses: {
    200: { description: "Updated endpoint", content: { "application/json": { schema: webhookEndpointSchema } } },
    400: { description: "Invalid request", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const deleteRouteDef = createRoute({
  method: "delete",
  path: "/webhook_endpoints/{id}",
  tags: ["Webhooks"],
  summary: "Delete a webhook endpoint",
  security,
  request: { params: webhookEndpointParamsSchema },
  responses: { 204: { description: "Deleted" }, 404: { description: "Not found", content: { "application/json": { schema: errorSchema } } } },
});

const rotateRouteDef = createRoute({
  method: "post",
  path: "/webhook_endpoints/{id}/rotate_secret",
  tags: ["Webhooks"],
  summary: "Rotate webhook endpoint secret",
  security,
  request: { params: webhookEndpointParamsSchema },
  responses: {
    200: { description: "Rotated endpoint", content: { "application/json": { schema: webhookEndpointSecretSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const testRouteDef = createRoute({
  method: "post",
  path: "/webhook_endpoints/{id}/test",
  tags: ["Webhooks"],
  summary: "Send a test event",
  security,
  request: { params: webhookEndpointParamsSchema },
  responses: {
    202: {
      description: "Test event queued",
      content: {
        "application/json": {
          schema: webhookEndpointParamsSchema.extend({ event_id: webhookEndpointParamsSchema.shape.id, queued_at: isoDateTimeSchema }),
        },
      },
    },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export function createWebhooksRoutes(events: EventsService) {
  const app = new OpenAPIHono<AppEnv>();
  const webhooks = new WebhooksService(events);

  return app
    .openapi(createRouteDef, async (c) => {
      const body = c.req.valid("json");
      return c.json(await webhooks.createEndpoint(c.var.db, c.var.merchant.merchant.id, body), 201);
    })
    .openapi(listRouteDef, async (c) => {
      return c.json(await webhooks.listEndpoints(c.var.db, c.var.merchant.merchant.id), 200);
    })
    .openapi(patchRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await webhooks.updateEndpoint(c.var.db, c.var.merchant.merchant.id, id, body), 200);
    })
    .openapi(deleteRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      await webhooks.deleteEndpoint(c.var.db, c.var.merchant.merchant.id, id);
      return c.body(null, 204);
    })
    .openapi(rotateRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await webhooks.rotateSecret(c.var.db, c.var.merchant.merchant.id, id), 200);
    })
    .openapi(testRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await webhooks.sendTest(c.var.db, c.var.merchant.merchant.id, id), 202);
    });
}
