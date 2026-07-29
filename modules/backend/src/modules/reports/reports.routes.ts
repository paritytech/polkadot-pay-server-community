// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "../../types";
import { getReportVolume } from "./reports.service";
import { reportsVolumeQuerySchema, reportsVolumeSchema } from "./reports.schema";

const security = [{ bearerAuth: [] }];

const volumeRoute = createRoute({
  method: "get",
  path: "/reports/volume",
  tags: ["Reports"],
  summary: "Volume report",
  security,
  request: { query: reportsVolumeQuerySchema },
  responses: {
    200: { description: "Volume totals", content: { "application/json": { schema: reportsVolumeSchema } } },
  },
});

export function createReportsRoutes() {
  return new OpenAPIHono<AppEnv>().openapi(volumeRoute, async (c) => {
    const query = c.req.valid("query");
    const volume = await getReportVolume(c.var.db, c.var.merchant.merchant.id, query);
    return c.json(volume, 200);
  });
}
