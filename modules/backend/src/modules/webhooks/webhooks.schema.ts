// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

import { errorSchema, isoDateTimeSchema } from "../api/api.schema";

export const webhookEndpointStatusSchema = z.enum(["enabled", "disabled"]);
export const webhookEventsListSchema = z.array(z.string()).default(["*"]);

export const webhookEndpointSchema = z.object({
  id: z.string(),
  object: z.literal("webhook_endpoint"),
  url: z.string().url(),
  events: z.array(z.string()),
  status: webhookEndpointStatusSchema,
  created_at: isoDateTimeSchema,
});

export const webhookEndpointSecretSchema = webhookEndpointSchema.extend({
  secret: z.string().openapi({
    description:
      "Webhook signing secret, returned in full only on create or rotate. Use it to verify the payment-processor-signature header on every delivery.",
    example: "whsec_...",
  }),
});

export const createWebhookEndpointBodySchema = z.object({
  url: z.string().url().openapi({
    description:
      "Public HTTPS endpoint that will receive signed webhook deliveries. Only http(s) URLs are accepted.",
    example: "https://merchant.example/webhooks/payment-processor",
  }),
  events: webhookEventsListSchema.optional().openapi({
    description:
      "Event types this endpoint is subscribed to. Omit to subscribe to every event type. An empty array is rejected.",
    example: ["payment.created", "payment.received", "payment.settling", "payment.confirming", "payment.settled", "payment.failed", "payment.expired", "payment.canceled", "test.ping"],
  }),
});

export const updateWebhookEndpointBodySchema = z.object({
  url: z.string().url().optional().openapi({
    description:
      "Public HTTPS endpoint that will receive signed webhook deliveries. Only http(s) URLs are accepted.",
    example: "https://merchant.example/webhooks/payment-processor",
  }),
  events: webhookEventsListSchema.optional().openapi({
    description:
      "Event types this endpoint is subscribed to. Omit to keep the existing subscription. An empty array is rejected.",
    example: ["payment.created", "payment.received", "payment.settling", "payment.confirming", "payment.settled", "payment.failed", "payment.expired", "payment.canceled", "test.ping"],
  }),
  status: webhookEndpointStatusSchema.optional(),
});

export const webhookEndpointParamsSchema = z.object({ id: z.string() });

export const webhookEndpointsListSchema = z.object({
  object: z.literal("list"),
  data: z.array(webhookEndpointSchema),
  has_more: z.boolean(),
});

export const invalidUrlErrorSchema = errorSchema;
