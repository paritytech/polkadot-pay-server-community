// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const errorSchema = z
  .object({
    error: z.object({
      type: z.enum([
        "invalid_request_error",
        "authentication_error",
        "not_found_error",
        "api_error",
      ]),
      code: z.string(),
      message: z.string(),
      param: z.string().optional(),
    }),
  })
  .openapi("ApiError");
