// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv, ChainState } from "../../types";

import { healthSchema } from "./health.schema";

const healthRoute = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["Public"],
  summary: "Service health",
  description: "Returns process health plus statement-listener connectivity.",
  responses: {
    200: {
      description: "Listener health",
      content: {
        "application/json": {
          schema: healthSchema,
        },
      },
    },
  },
});

export function createHealthRoutes(getChainState: () => ChainState) {
  return new OpenAPIHono<AppEnv>().openapi(healthRoute, (c) => {
    const state = getChainState();
    return c.json(
      {
        ok: true,
        chain: state.chain,
        pending_subscriptions: state.pendingSubscriptions,
      },
      200,
    );
  });
}
