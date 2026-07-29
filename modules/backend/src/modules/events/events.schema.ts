// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

import { isoDateTimeSchema } from "../api/api.schema";
import { paymentSchema } from "../payments/payments.schema";

export const webhookEventTypeSchema = z.enum([
  "payment.created",
  "payment.received",
  "payment.settling",
  "payment.confirming",
  "payment.settled",
  "payment.failed",
  "payment.expired",
  "payment.canceled",
  "test.ping",
]);

export const eventParamsSchema = z.object({ id: z.string() });

const testPingObjectSchema = z.object({ object: z.literal("test.ping"), message: z.string() });

export const eventPayloadSchema = z.object({
  id: z.string(),
  object: z.literal("event"),
  type: webhookEventTypeSchema,
  created_at: isoDateTimeSchema,
  data: z.object({ object: z.union([paymentSchema, testPingObjectSchema]) }),
});

export const eventEnvelopeSchema = eventPayloadSchema.extend({
  deliveries: z.array(
    z.object({
      id: z.string(),
      endpoint_id: z.string(),
      status: z.enum(["pending", "succeeded", "failed"]),
      attempt_count: z.number().int().nonnegative(),
      last_status_code: z.number().int().nullable(),
      last_error: z.string().nullable(),
      delivered_at: isoDateTimeSchema.nullable(),
      created_at: isoDateTimeSchema,
    }),
  ),
});

export const eventsListSchema = z.object({
  object: z.literal("list"),
  data: z.array(eventEnvelopeSchema),
  has_more: z.boolean(),
});

export const eventsListQuerySchema = z.object({
  type: webhookEventTypeSchema.optional().openapi({
    description: "Filter the event log to a single event type.",
    example: "payment.received",
  }),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25).openapi({
    description: "Maximum number of events to return per page (1-100, default 25).",
    example: 25,
  }),
  starting_after: z.string().optional().openapi({
    description:
      "Cursor for pagination. When the previous response's has_more is true, pass the last item's id to fetch the next page.",
    example: "evt_01K0PAYMENTPROCESSOR0000000000000000",
  }),
});
