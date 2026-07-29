// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { MiddlewareHandler } from "hono";

import { apiError } from "./error";
import type { AppEnv } from "../types";
import { sha256Hex } from "../lib/crypto";
import { findAuthenticatedMerchantByKeyHash } from "../modules/accounts/accounts.repo";

const BEARER_PREFIX = "Bearer ";
const SECRET_PREFIX = "payment_processor_sk_";

function extractBearerSecret(header: string | undefined): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token.startsWith(SECRET_PREFIX)) {
    return null;
  }

  return token;
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method === "POST" && c.req.path === "/v1/accounts") {
    await next();
    return;
  }

  const secret = extractBearerSecret(c.req.header("authorization"));
  if (!secret) {
    return apiError(
      c,
      401,
      "authentication_error",
      "invalid_api_key",
      "Missing or invalid Authorization bearer token.",
    );
  }

  const merchant = await findAuthenticatedMerchantByKeyHash(c.var.db, sha256Hex(secret));
  if (!merchant) {
    return apiError(
      c,
      401,
      "authentication_error",
      "invalid_api_key",
      "Missing or invalid Authorization bearer token.",
    );
  }

  c.set("merchant", merchant);
  await next();
};
