// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { mkdir, rm } from "node:fs/promises";

const env = {
  DATABASE_URL: "postgres://docs:docs@localhost:5432/docs",
  MASTER_KEY: "0".repeat(64),
  SIGNUP_CODE: "docs",
  REDIS_URL: "redis://localhost:6379",
  BASE_URL: "https://example.invalid",
  NETWORK: "paseo-next-v2",
};

Object.assign(process.env, env);

const { createApp } = await import("../src/app");

const unusedDependency = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error("Documentation build dependency was unexpectedly invoked");
      };
    },
  },
);

const app = createApp({
  db: unusedDependency as never,
  payments: unusedDependency as never,
  events: unusedDependency as never,
  getChainState: () => ({ chain: "connected", pendingSubscriptions: 0 }),
});

const response = await app.request("/openapi.json");
if (!response.ok) {
  throw new Error(`Failed to generate OpenAPI document: ${response.status} ${await response.text()}`);
}

const spec = await response.json();
const outputDirectory = new URL("../dist-docs/", import.meta.url);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(new URL("reference/", outputDirectory), { recursive: true });

const guideSource = await Bun.file(new URL("../src/modules/docs/index.html", import.meta.url)).text();
const guide = guideSource
  .replaceAll('href="/docs/reference"', 'href="./reference/"')
  .replaceAll('href="/openapi.json"', 'href="./openapi.json"')
  .replaceAll('href="/docs"', 'href="./"')
  .replace(/<a([^>]*?)href="\/dashboard"([^>]*)>(.*?)<\/a>/gs, '<span$1$2 title="Dashboard is not available on the static documentation site">Dashboard unavailable on this site</span>');

const reference = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payment Processor API Reference</title>
    <style>
      :root {
        --scalar-background-1: #ffffff;
        --scalar-background-2: #f5f7fb;
        --scalar-background-3: #e5e7eb;
        --scalar-color-1: #111827;
        --scalar-color-2: #6b7280;
        --scalar-color-3: #6b7280;
        --scalar-border-color: #e5e7eb;
        --scalar-color-accent: #111827;
      }
    </style>
  </head>
  <body>
    <script id="api-reference" data-url="../openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.40.0/dist/browser/standalone.js"></script>
  </body>
</html>
`;

await Promise.all([
  Bun.write(new URL("openapi.json", outputDirectory), `${JSON.stringify(spec, null, 2)}\n`),
  Bun.write(new URL("index.html", outputDirectory), guide),
  Bun.write(new URL("reference/index.html", outputDirectory), reference),
]);

console.log("Built static API documentation in dist-docs/");
