// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

import { isoDateTimeSchema } from "../api/api.schema";

export const paymentStatusSchema = z.enum(["pending", "received", "settling", "confirming", "settled", "expired", "canceled", "failed"]);
export const metadataSchema = z.record(z.string(), z.unknown()).default({});

export const paymentPaidSchema = z
  .object({
    amount: z.string(),
    coin_count: z.number().int().positive(),
    payer_timestamp_ms: z.number().int().nonnegative(),
  })
  .openapi("PaymentPaid");

/** v1 settlement modality: per-coin bearer-coin claims. Future modalities join a discriminated union on `version`. */
export const paymentSettlementV1Schema = z
  .object({
    version: z.literal(1),
    claim_tx_hash: z.string().nullable(),
    claim_tx_hashes: z.array(z.string()),
    claim_last_error: z.string().nullable(),
    claim_attempts: z.number().int().nonnegative(),
    claim_max_attempts: z.number().int().nonnegative(),
    claimed_at: isoDateTimeSchema.nullable(),
  })
  .openapi("PaymentSettlementV1");

export const paymentSchema = z
  .object({
    id: z.string(),
    object: z.literal("payment"),
    status: paymentStatusSchema,
    amount: z.string(),
    currency: z.literal("CASH"),
    description: z.string().nullable(),
    reference: z.string().nullable(),
    metadata: metadataSchema,
    display_name: z.string().nullable(),
    payment_url: z.string().url(),
    qr: z.object({
      deeplink: z.string(),
      png: z.string().url(),
      svg: z.string().url(),
    }),
    settlement: paymentSettlementV1Schema,
    paid: paymentPaidSchema.nullable(),
    created_at: isoDateTimeSchema,
    expires_at: isoDateTimeSchema,
    received_at: isoDateTimeSchema.nullable(),
    completed_at: isoDateTimeSchema.nullable(),
    canceled_at: isoDateTimeSchema.nullable(),
  })
  .openapi("Payment");

export const createPaymentBodySchema = z
  .object({
    amount: z.string().openapi({
      description:
        "Charge amount as a decimal string with up to two fractional digits. Trimmed, must be greater than zero and at most 10000.00; rendered with Number(...).toFixed(2) (so \"12\" becomes \"12.00\").",
      example: "12.50",
    }),
    currency: z.literal("CASH").optional().default("CASH").openapi({
      description: "Only the CASH currency is supported.",
      example: "CASH",
    }),
    description: z.string().max(500).optional().nullable().openapi({
      description: "Optional merchant-facing description, at most 500 characters.",
      example: "Order #1234",
    }),
    reference: z.string().max(500).optional().nullable().openapi({
      description: "Optional merchant-side reference id, at most 500 characters.",
      example: "ord_1234",
    }),
    metadata: metadataSchema.optional().openapi({
      description:
        "Optional metadata object. Serialized with JSON.stringify; the UTF-8 byte length must not exceed 4096.",
      example: { order_id: "ord_1234" },
    }),
    display_name: z.string().max(120).optional().nullable().openapi({
      description:
        "Optional merchant display name shown to the payer (at most 120 characters).",
      example: "Acme Store",
    }),
    expires_in: z.number().int().optional().openapi({
      description:
        "Lifetime of the payment in seconds. Defaults to 900; must be an integer from 60 through 86400.",
      example: 900,
    }),
  })
  .openapi("CreatePaymentRequest");

export const createPaymentResponseSchema = paymentSchema;

export const paymentParamsSchema = z.object({
  id: z.string(),
});

export const listPaymentsQuerySchema = z.object({
  status: paymentStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  starting_after: z.string().optional(),
  created_gte: z.string().datetime({ offset: true }).optional(),
  created_lte: z.string().datetime({ offset: true }).optional(),
});

export const paymentsListSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(paymentSchema),
    has_more: z.boolean(),
  })
  .openapi("PaymentsList");

export const publicPaymentStatusSchema = z
  .object({
    id: z.string(),
    status: paymentStatusSchema,
    amount: z.string(),
    currency: z.literal("CASH"),
    display_name: z.string().nullable(),
    expires_at: isoDateTimeSchema,
  })
  .openapi("PublicPaymentStatus");
