// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

import { errorSchema, isoDateTimeSchema } from "../api/api.schema.ts";

export const merchantSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    created_at: isoDateTimeSchema,
  })
  .openapi("Merchant");

export const signupBodySchema = z.object({
  name: z.string().min(1).max(200),
  signup_code: z.string().min(1).openapi({
    description:
      "Required shared secret for self-service account creation. Malformed or missing values are rejected as invalid requests; a valid value must exactly match the backend SIGNUP_CODE.",
    example: "open-merchants-2026",
  }),
});

export const updateAccountBodySchema = z.object({
  name: z.string().min(1).max(200),
});

export const apiKeySchema = z.object({
  id: z.string(),
  object: z.literal("api_key"),
  label: z.string().nullable(),
  last4: z.string(),
  created_at: isoDateTimeSchema,
  revoked_at: isoDateTimeSchema.nullable(),
});

export const apiKeySecretSchema = apiKeySchema.extend({
  secret: z.string().openapi({
    description:
      "Bearer secret for the API key, returned in full exactly once on create or rotate. Treat it like a password; the dashboard and /v1/api_keys responses never expose it again.",
    example: "payment_processor_sk_...",
  }),
});

export const createApiKeyBodySchema = z.object({
  label: z.string().max(200).optional().nullable().openapi({
    description: "Human-friendly label so the merchant can tell keys apart in the dashboard.",
    example: "Production",
  }),
});

export const apiKeyParamsSchema = z.object({ id: z.string() });

export const accountResponseSchema = merchantSchema;

export const signupResponseSchema = z.object({
  account: merchantSchema,
  api_key: apiKeySecretSchema,
});

export const apiKeysListSchema = z.object({
  object: z.literal("list"),
  data: z.array(apiKeySchema),
  has_more: z.boolean(),
});

export const lastActiveKeyErrorSchema = errorSchema;
