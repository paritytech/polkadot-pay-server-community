// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { OpenAPIHono } from "@hono/zod-openapi";

import { createAccountsRoutes } from "./modules/accounts/accounts.routes";
import { config } from "./env";
import { createDocsRoutes, registerOpenApiDocument } from "./modules/docs/docs.routes";
import { createEventsRoutes } from "./modules/events/events.routes";
import { createHealthRoutes } from "./modules/health/health.routes";
import { createPaymentsRoutes } from "./modules/payments/payments.routes";
import { createPublicPaymentRoutes } from "./modules/payments/payments.public.routes";
import { createReportsRoutes } from "./modules/reports/reports.routes";
import { createWebhooksRoutes } from "./modules/webhooks/webhooks.routes";
import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { loggerMiddleware } from "./middleware/logger";
import type { AppDependencies, AppEnv } from "./types";

export function createApp({ db, payments, events, getChainState }: AppDependencies) {
  const app = new OpenAPIHono<AppEnv>();
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
  });
  app.onError(errorHandler);

  const v1 = new OpenAPIHono<AppEnv>()
    .use("*", authMiddleware)
    .route("/", createAccountsRoutes())
    .route("/", createPaymentsRoutes(payments))
    .route("/", createWebhooksRoutes(events))
    .route("/", createEventsRoutes())
    .route("/", createReportsRoutes());

  const routes = app
    .use("*", loggerMiddleware)
    .use("*", async (c, next) => {
      c.set("db", db);
      await next();
    })
    .route("/", createPublicPaymentRoutes(payments))
    .route("/", createDocsRoutes({ registerDocument: false }))
    .route("/", createHealthRoutes(getChainState))
    .route("/v1", v1)
    .get("/dashboard", (c) => c.redirect(config.dashboardUrl, 302));

  registerOpenApiDocument(app);
  return routes;
}

export type AppType = ReturnType<typeof createApp>;
