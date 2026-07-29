// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { HTTPException } from "hono/http-exception";
import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnv } from "../types";
import { AppError, buildApiError } from "../lib/errors";

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  type: AppError["type"],
  code: string,
  message: string,
  param?: string,
): Response {
  return c.json(buildApiError(type, code, message, param), status);
}

export function apiException(
  status: ContentfulStatusCode,
  type: AppError["type"],
  code: string,
  message: string,
  param?: string,
): HTTPException {
  return new HTTPException(status, {
    message,
    res: new Response(JSON.stringify(buildApiError(type, code, message, param)), {
      status,
      headers: { "content-type": "application/json" },
    }),
  });
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return c.json(err.body, err.status as ContentfulStatusCode);
  }
  if (err && typeof err === "object" && "getResponse" in err && typeof err.getResponse === "function") {
    return err.getResponse();
  }

  c.var.logger.error({ event: "http_request_failed", err });
  return apiError(c, 500, "api_error", "internal_error", "Internal server error.");
};
