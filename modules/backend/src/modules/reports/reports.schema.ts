// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

import { isoDateTimeSchema } from "../api/api.schema";

export const reportsIntervalSchema = z.enum(["day", "hour", "total"]);

export const reportsVolumeQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: reportsIntervalSchema.optional().default("day"),
});

export const reportsVolumeSchema = z.object({
  object: z.literal("report.volume"),
  buckets: z.array(
    z.object({
      start: isoDateTimeSchema,
      count: z.number().int().nonnegative(),
      amount: z.string(),
    }),
  ),
  total: z.object({
    count: z.number().int().nonnegative(),
    amount: z.string(),
  }),
});
