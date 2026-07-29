// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { z } from "@hono/zod-openapi";

export const healthSchema = z
  .object({
    ok: z.literal(true),
    chain: z.enum(["connected", "reconnecting"]),
    pending_subscriptions: z.number().int().nonnegative(),
  })
  .openapi("Health");
