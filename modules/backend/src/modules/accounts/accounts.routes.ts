// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";

import { config } from "../../env.ts";
import { errorSchema } from "../api/api.schema.ts";
import type { AppEnv } from "../../types.ts";
import {
  accountResponseSchema,
  apiKeyParamsSchema,
  apiKeysListSchema,
  apiKeySecretSchema,
  createApiKeyBodySchema,
  signupBodySchema,
  signupResponseSchema,
  updateAccountBodySchema,
} from "./accounts.schema.ts";
import {
  createAccount,
  createApiKey,
  getAccount,
  listApiKeys,
  revokeApiKey,
  updateAccount,
} from "./accounts.service.ts";

const security = [{ bearerAuth: [] }];

const signupRoute = createRoute({
  method: "post",
  path: "/accounts",
  tags: ["Account & Keys"],
  summary: "Create an account",
  request: { body: { required: true, content: { "application/json": { schema: signupBodySchema } } } },
  responses: {
    201: { description: "Created account", content: { "application/json": { schema: signupResponseSchema } } },
    400: { description: "Missing or malformed signup code", content: { "application/json": { schema: errorSchema } } },
    403: {
      description: "Invalid signup code",
      content: {
        "application/json": {
          schema: errorSchema,
          example: {
            error: {
              type: "authentication_error",
              code: "invalid_signup_code",
              message: "Signup code is invalid.",
              param: "signup_code",
            },
          },
        },
      },
    },
  },
});

const getAccountRoute = createRoute({
  method: "get",
  path: "/account",
  tags: ["Account & Keys"],
  summary: "Get current account",
  security,
  responses: { 200: { description: "Current account", content: { "application/json": { schema: accountResponseSchema } } } },
});

const patchAccountRoute = createRoute({
  method: "patch",
  path: "/account",
  tags: ["Account & Keys"],
  summary: "Update current account",
  security,
  request: { body: { required: true, content: { "application/json": { schema: updateAccountBodySchema } } } },
  responses: { 200: { description: "Updated account", content: { "application/json": { schema: accountResponseSchema } } } },
});

const createApiKeyRoute = createRoute({
  method: "post",
  path: "/api_keys",
  tags: ["Account & Keys"],
  summary: "Create an API key",
  security,
  request: { body: { required: true, content: { "application/json": { schema: createApiKeyBodySchema } } } },
  responses: { 201: { description: "Created API key", content: { "application/json": { schema: apiKeySecretSchema } } } },
});

const listApiKeysRoute = createRoute({
  method: "get",
  path: "/api_keys",
  tags: ["Account & Keys"],
  summary: "List API keys",
  security,
  responses: { 200: { description: "API keys", content: { "application/json": { schema: apiKeysListSchema } } } },
});

const deleteApiKeyRoute = createRoute({
  method: "delete",
  path: "/api_keys/{id}",
  tags: ["Account & Keys"],
  summary: "Revoke an API key",
  security,
  request: { params: apiKeyParamsSchema },
  responses: {
    204: { description: "Revoked" },
    400: { description: "Last active key", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export function createAccountsRoutes() {
  return new OpenAPIHono<AppEnv>()
    .openapi(signupRoute, async (c) => {
      const body = c.req.valid("json");
      const result = await createAccount(c.var.db, {
        name: body.name,
        signupCode: body.signup_code,
        expectedSignupCode: config.signupCode,
      });
      return c.json(result, 201);
    })
    .openapi(getAccountRoute, async (c) => {
      return c.json(await getAccount(c.var.db, c.var.merchant.merchant.id), 200);
    })
    .openapi(patchAccountRoute, async (c) => {
      const body = c.req.valid("json");
      const result = await updateAccount(c.var.db, { merchantId: c.var.merchant.merchant.id, name: body.name });
      return c.json(result, 200);
    })
    .openapi(createApiKeyRoute, async (c) => {
      const body = c.req.valid("json");
      const result = await createApiKey(c.var.db, {
        merchantId: c.var.merchant.merchant.id,
        label: body.label ?? null,
      });
      return c.json(result, 201);
    })
    .openapi(listApiKeysRoute, async (c) => {
      return c.json(await listApiKeys(c.var.db, c.var.merchant.merchant.id), 200);
    })
    .openapi(deleteApiKeyRoute, async (c) => {
      const { id } = c.req.valid("param");
      await revokeApiKey(c.var.db, { merchantId: c.var.merchant.merchant.id, apiKeyId: id });
      return c.body(null, 204);
    });
}
