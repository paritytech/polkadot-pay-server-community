// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { errorSchema } from "../api/api.schema";
import type { AppEnv } from "../../types";
import { toPaymentPublic } from "./payments.public";
import { createPaymentBodySchema, listPaymentsQuerySchema, paymentParamsSchema, paymentSchema, paymentsListSchema } from "./payments.schema";
import type { PaymentsService } from "./payments.service";

const security = [{ bearerAuth: [] }];

const createPaymentRoute = createRoute({
  method: "post",
  path: "/payments",
  tags: ["Payments"],
  summary: "Create a payment",
  security,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: createPaymentBodySchema,
        },
      },
    },
    headers: z.object({
      authorization: z.string().optional(),
      "idempotency-key": z.string().optional().openapi({
        description:
          "Optional caller-supplied key (e.g. order id) that makes POST /v1/payments safe to retry. Resending the same key with the same normalized amount returns the original payment; resending with a different normalized amount returns HTTP 409. Other request fields are not compared for idempotency conflicts.",
        example: "order-1234",
      }),
    }),
  },
  responses: {
    201: {
      description: "Created payment",
      content: {
        "application/json": {
          schema: paymentSchema,
        },
      },
    },
    400: { description: "Invalid request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Invalid API key", content: { "application/json": { schema: errorSchema } } },
    409: { description: "Idempotency conflict", content: { "application/json": { schema: errorSchema } } },
  },
});

const getPaymentRoute = createRoute({
  method: "get",
  path: "/payments/{id}",
  tags: ["Payments"],
  summary: "Fetch a payment",
  security,
  request: { params: paymentParamsSchema },
  responses: {
    200: {
      description: "Payment",
      content: { "application/json": { schema: paymentSchema } },
    },
    401: { description: "Invalid API key", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const listPaymentsRoute = createRoute({
  method: "get",
  path: "/payments",
  tags: ["Payments"],
  summary: "List payments",
  security,
  request: { query: listPaymentsQuerySchema },
  responses: {
    200: {
      description: "Paginated payments",
      content: { "application/json": { schema: paymentsListSchema } },
    },
    401: { description: "Invalid API key", content: { "application/json": { schema: errorSchema } } },
  },
});

const cancelPaymentRoute = createRoute({
  method: "post",
  path: "/payments/{id}/cancel",
  tags: ["Payments"],
  summary: "Cancel a payment",
  security,
  request: { params: paymentParamsSchema },
  responses: {
    200: {
      description: "Canceled payment",
      content: { "application/json": { schema: paymentSchema } },
    },
    400: { description: "Payment not cancelable", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Invalid API key", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

function parseOptionalDate(value: string | undefined): number | undefined {
  return value ? Date.parse(value) : undefined;
}

export function createPaymentsRoutes(payments: PaymentsService) {
  return new OpenAPIHono<AppEnv>()
    .openapi(createPaymentRoute, async (c) => {
      const body = c.req.valid("json");
      const headers = c.req.valid("header");
      const payment = await payments.createPayment(c.var.merchant.merchant, body, headers["idempotency-key"]);
      return c.json(toPaymentPublic(payment), 201);
    })
    .openapi(getPaymentRoute, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(toPaymentPublic(await payments.getPayment(c.var.merchant.merchant.id, id)), 200);
    })
    .openapi(listPaymentsRoute, async (c) => {
      const query = c.req.valid("query");
      const result = await payments.listPayments({
        merchantId: c.var.merchant.merchant.id,
        status: query.status,
        limit: query.limit,
        startingAfter: query.starting_after,
        createdGte: parseOptionalDate(query.created_gte),
        createdLte: parseOptionalDate(query.created_lte),
      });
      return c.json(
        {
          object: "list" as const,
          data: result.data.map(toPaymentPublic),
          has_more: result.hasMore,
        },
        200,
      );
    })
    .openapi(cancelPaymentRoute, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(toPaymentPublic(await payments.cancelPayment(c.var.merchant.merchant.id, id)), 200);
    });
}
