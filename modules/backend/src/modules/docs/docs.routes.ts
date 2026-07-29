// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Scalar } from "@scalar/hono-api-reference";
import { OpenAPIHono } from "@hono/zod-openapi";

import type { AppEnv } from "../../types";

const docsDescription = "[Start with the integration guide](/docs), then use this reference for every request, response, and error schema.";

const scalarCustomCss = `:root {
  --scalar-background-1: #ffffff;
  --scalar-background-2: #f5f7fb;
  --scalar-background-3: #e5e7eb;
  --scalar-color-1: #111827;
  --scalar-color-2: #6b7280;
  --scalar-color-3: #6b7280;
  --scalar-border-color: #e5e7eb;
  --scalar-color-accent: #111827;
}`;

const guidesFile = Bun.file(new URL("./index.html", import.meta.url));

export function registerOpenApiDocument(app: OpenAPIHono<AppEnv>): void {
  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Payment Processor API",
      version: "1.0.0",
      description: docsDescription,
    },
    tags: [
      { name: "Account & Keys", description: "Create merchant accounts and manage bearer API keys." },
      { name: "Payments", description: "Create, inspect, list, and cancel payment intents." },
      { name: "Webhooks", description: "Register endpoints and manage signed deliveries." },
      { name: "Events", description: "Inspect and replay webhook event delivery history." },
      { name: "Reports", description: "Query merchant payment-volume summaries." },
      { name: "Public", description: "Render hosted payment pages, QR assets, and public status." },
    ],
  });
}

export type CreateDocsRoutesOptions = {
  registerDocument?: boolean;
};

export function createDocsRoutes(options: CreateDocsRoutesOptions = {}) {
  const openApiApp = new OpenAPIHono<AppEnv>();
  const routes = openApiApp
    .get("/docs", async (c) => c.html(await guidesFile.text()))
    .get(
      "/docs/reference",
      Scalar({
        sources: [{ url: "/openapi.json", title: "Payment Processor API", default: true }],
        theme: "default",
        pageTitle: "Payment Processor API Reference",
        hideDarkModeToggle: true,
        layout: "modern",
        showSidebar: true,
        defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
        customCss: scalarCustomCss,
      }),
    );

  if (options.registerDocument !== false) {
    registerOpenApiDocument(openApiApp);
  }

  return routes;
}
