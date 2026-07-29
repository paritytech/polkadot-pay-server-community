// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "../../types";
import { errorSchema } from "../api/api.schema";
import { EventsService } from "./events.service";
import {
  eventEnvelopeSchema,
  eventParamsSchema,
  eventsListQuerySchema,
  eventsListSchema,
} from "./events.schema";

const security = [{ bearerAuth: [] }];

const listRouteDef = createRoute({
  method: "get",
  path: "/events",
  tags: ["Events"],
  summary: "List events",
  security,
  request: { query: eventsListQuerySchema },
  responses: { 200: { description: "Event log", content: { "application/json": { schema: eventsListSchema } } } },
});

const getRouteDef = createRoute({
  method: "get",
  path: "/events/{id}",
  tags: ["Events"],
  summary: "Fetch an event",
  security,
  request: { params: eventParamsSchema },
  responses: {
    200: { description: "Event", content: { "application/json": { schema: eventEnvelopeSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const resendRouteDef = createRoute({
  method: "post",
  path: "/events/{id}/resend",
  tags: ["Events"],
  summary: "Re-enqueue webhook deliveries for an event",
  security,
  request: { params: eventParamsSchema },
  responses: {
    202: { description: "Event re-enqueued", content: { "application/json": { schema: eventEnvelopeSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } },
  },
});

export function createEventsRoutes() {
  const app = new OpenAPIHono<AppEnv>();
  const events = new EventsService();

  return app
    .openapi(listRouteDef, async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await events.list(c.var.db, c.var.merchant.merchant.id, {
          type: query.type,
          limit: query.limit,
          startingAfter: query.starting_after,
        }),
        200,
      );
    })
    .openapi(getRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await events.get(c.var.db, c.var.merchant.merchant.id, id), 200);
    })
    .openapi(resendRouteDef, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await events.resend(c.var.db, c.var.merchant.merchant.id, id), 202);
    });
}
