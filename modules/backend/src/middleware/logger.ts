// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { MiddlewareHandler } from "hono";

import { logger } from "../lib/logger";
import type { AppEnv } from "../types";

export const loggerMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const incomingRequestId = c.req.header("x-request-id");
  const requestId = incomingRequestId?.trim() ? incomingRequestId : crypto.randomUUID();
  const requestLogger = logger.child({ requestId });
  const start = performance.now();

  c.set("requestId", requestId);
  c.set("logger", requestLogger);
  c.header("x-request-id", requestId);

  try {
    await next();
  } finally {
    const status = c.res?.status ?? 500;
    const fields = {
      event: "http_request_completed",
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: performance.now() - start,
    };

    if (status >= 500) {
      requestLogger.error(fields);
    } else if (status >= 400) {
      requestLogger.warn(fields);
    } else {
      requestLogger.info(fields);
    }
  }
};
