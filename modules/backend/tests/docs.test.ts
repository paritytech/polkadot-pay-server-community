// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { beforeAll, describe, expect, it } from "bun:test";

import { apiKeySecretSchema, createApiKeyBodySchema } from "../src/modules/accounts/accounts.schema.ts";
import { createDocsRoutes } from "../src/modules/docs/docs.routes.ts";
import { eventsListQuerySchema } from "../src/modules/events/events.schema.ts";
import { createPaymentBodySchema, paymentSchema } from "../src/modules/payments/payments.schema.ts";
import {
  createWebhookEndpointBodySchema,
  updateWebhookEndpointBodySchema,
  webhookEndpointSecretSchema,
} from "../src/modules/webhooks/webhooks.schema.ts";
import type { AppDependencies, ChainState } from "../src/types.ts";

const TAG_ORDER = ["Account & Keys", "Payments", "Webhooks", "Events", "Reports", "Public"] as const;

const TAG_DESCRIPTIONS: Record<(typeof TAG_ORDER)[number], string> = {
  "Account & Keys": "Create merchant accounts and manage bearer API keys.",
  Payments: "Create, inspect, list, and cancel payment intents.",
  Webhooks: "Register endpoints and manage signed deliveries.",
  Events: "Inspect and replay webhook event delivery history.",
  Reports: "Query merchant payment-volume summaries.",
  Public: "Render hosted payment pages, QR assets, and public status.",
};

const TAG_PREFIX_MAP: Record<(typeof TAG_ORDER)[number], ReadonlyArray<string>> = {
  "Account & Keys": ["/v1/accounts", "/v1/account", "/v1/api_keys"],
  Payments: ["/v1/payments"],
  Webhooks: ["/v1/webhook_endpoints"],
  Events: ["/v1/events"],
  Reports: ["/v1/reports"],
  Public: ["/healthz", "/public/payments", "/pay/"],
};

const EXPECTED_OPERATIONS: ReadonlyArray<readonly [string, string]> = [
  ["POST", "/v1/accounts"],
  ["GET", "/v1/account"],
  ["PATCH", "/v1/account"],
  ["POST", "/v1/api_keys"],
  ["GET", "/v1/api_keys"],
  ["DELETE", "/v1/api_keys/{id}"],
  ["POST", "/v1/payments"],
  ["GET", "/v1/payments"],
  ["GET", "/v1/payments/{id}"],
  ["POST", "/v1/payments/{id}/cancel"],
  ["POST", "/v1/webhook_endpoints"],
  ["GET", "/v1/webhook_endpoints"],
  ["PATCH", "/v1/webhook_endpoints/{id}"],
  ["DELETE", "/v1/webhook_endpoints/{id}"],
  ["POST", "/v1/webhook_endpoints/{id}/rotate_secret"],
  ["POST", "/v1/webhook_endpoints/{id}/test"],
  ["GET", "/v1/events"],
  ["GET", "/v1/events/{id}"],
  ["POST", "/v1/events/{id}/resend"],
  ["GET", "/v1/reports/volume"],
  ["GET", "/healthz"],
  ["GET", "/public/payments/{id}/status"],
  ["GET", "/public/payments/{id}/qr.svg"],
  ["GET", "/public/payments/{id}/qr.png"],
  ["GET", "/pay/{id}"],
];

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const;

const EXAMPLE_KEYS = [
  "api-key-response",
  "webhook-request",
  "webhook-response",
  "payment-request",
  "payment-response",
  "invalid-events-error",
] as const;

const PAYMENT_REQUEST_KEYS = [
  "amount",
  "currency",
  "description",
  "reference",
  "metadata",
  "metadata.order_id",
  "display_name",
  "expires_in",
];

const PAYMENT_RESPONSE_KEYS = [
  "id",
  "object",
  "status",
  "amount",
  "currency",
  "description",
  "reference",
  "metadata",
  "metadata.order_id",
  "display_name",
  "payment_url",
  "qr",
  "qr.deeplink",
  "qr.png",
  "qr.svg",
  "settlement",
  "settlement.version",
  "settlement.claim_tx_hash",
  "settlement.claim_tx_hashes",
  "settlement.claim_last_error",
  "settlement.claim_attempts",
  "settlement.claim_max_attempts",
  "settlement.claimed_at",
  "paid",
  "created_at",
  "expires_at",
  "received_at",
  "completed_at",
  "canceled_at",
];

const API_KEY_RESPONSE_KEYS = ["id", "object", "label", "last4", "created_at", "revoked_at", "secret"];
const WEBHOOK_RESPONSE_KEYS = ["id", "object", "url", "events", "status", "created_at", "secret"];
const API_KEY_RESPONSE_EXAMPLE = {
  id: "key_01K0PAYMENTPROCESSOR0000000000000000",
  object: "api_key",
  label: "Production",
  last4: "X7q9",
  created_at: "2026-07-20T12:00:00.000Z",
  revoked_at: null,
  secret: "payment_processor_sk_...",
} as const;

const WEBHOOK_REQUEST_EXAMPLE = {
  url: "https://merchant.example/webhooks/payment-processor",
  events: ["payment.created", "payment.received", "payment.settling", "payment.confirming", "payment.settled", "payment.failed", "payment.expired", "payment.canceled", "test.ping"],
} as const;

const WEBHOOK_RESPONSE_EXAMPLE = {
  id: "we_01K0PAYMENTPROCESSOR0000000000000000",
  object: "webhook_endpoint",
  url: "https://merchant.example/webhooks/payment-processor",
  events: ["payment.created", "payment.received", "payment.settling", "payment.confirming", "payment.settled", "payment.failed", "payment.expired", "payment.canceled", "test.ping"],
  status: "enabled",
  created_at: "2026-07-20T12:00:00.000Z",
  secret: "whsec_...",
} as const;

const PAYMENT_REQUEST_EXAMPLE = {
  amount: "12.50",
  currency: "CASH",
  description: "Order #1234",
  reference: "ord_1234",
  metadata: { order_id: "ord_1234" },
  display_name: "Acme Store",
  expires_in: 900,
} as const;

const PAYMENT_RESPONSE_EXAMPLE = {
  id: "pay01K0PAYMENTPROCESSOR0000000000000000",
  object: "payment",
  status: "pending",
  amount: "12.50",
  currency: "CASH",
  description: "Order #1234",
  reference: "ord_1234",
  metadata: { order_id: "ord_1234" },
  display_name: "Acme Store",
  payment_url: "https://api.example.com/pay/pay01K0PAYMENTPROCESSOR0000000000000000",
  qr: {
    deeplink:
      "polkadotapp://pay/cheque?id=pay01K0PAYMENTPROCESSOR0000000000000000&amount=12.50&key=PUBLIC_KEY&name=Acme%20Store",
    png: "https://api.example.com/public/payments/pay01K0PAYMENTPROCESSOR0000000000000000/qr.png",
    svg: "https://api.example.com/public/payments/pay01K0PAYMENTPROCESSOR0000000000000000/qr.svg",
  },
  settlement: {
    version: 1,
    claim_tx_hash: null,
    claim_tx_hashes: [],
    claim_last_error: null,
    claim_attempts: 0,
    claim_max_attempts: 5,
    claimed_at: null,
  },
  paid: null,
  created_at: "2026-07-20T12:00:00.000Z",
  expires_at: "2026-07-20T12:15:00.000Z",
  received_at: null,
  completed_at: null,
  canceled_at: null,
} as const;

const INVALID_EVENTS_ERROR_EXAMPLE = {
  error: {
    type: "invalid_request_error",
    code: "invalid_events",
    message: "At least one event must be selected.",
    param: "events",
  },
} as const;

const EVENT_PAYLOAD_EXCERPT = {
  id: "evt_01K0PAYMENTPROCESSOR0000000000000000",
  object: "event",
  type: "payment.received",
  created_at: "2026-07-20T12:01:00.000Z",
  data: {
    object: {
      id: "pay01K0PAYMENTPROCESSOR0000000000000000",
      object: "payment",
      status: "received",
      amount: "12.50",
      currency: "CASH",
    },
  },
} as const;

const BEARER_SECURITY = [{ bearerAuth: [] }] as const;

const decodeHtmlEntities = (value: string): string =>
  value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi, (encoded, entity: string) => {
    if (entity.startsWith("#")) {
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : encoded;
    }
    const namedEntities: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
    };
    return namedEntities[entity.toLowerCase()] ?? encoded;
  });

const exampleLabel = (html: string, key: string): string => {
  const exampleIndex = html.indexOf(`data-example="${key}"`);
  if (exampleIndex < 0) throw new Error(`data-example "${key}" not found`);
  const sampleIndex = html.lastIndexOf('<div class="sample">', exampleIndex);
  if (sampleIndex < 0) throw new Error(`sample for data-example "${key}" not found`);
  const labels = [...html.slice(sampleIndex, exampleIndex).matchAll(/<span class="sample-label">([\s\S]*?)<\/span>/g)];
  const label = labels.at(-1)?.[1];
  if (!label) throw new Error(`label for data-example "${key}" not found`);
  return decodeHtmlEntities(label.trim());
};

const labeledCode = (html: string, label: string): string => {
  const labelIndex = html.indexOf(`<span class="sample-label">${label}</span>`);
  if (labelIndex < 0) throw new Error(`sample label "${label}" not found`);
  const codeTagIndex = html.indexOf("<pre><code", labelIndex);
  const contentIndex = html.indexOf(">", codeTagIndex + "<pre>".length) + 1;
  const endIndex = html.indexOf("</code></pre>", contentIndex);
  if (codeTagIndex < 0 || contentIndex === 0 || endIndex < 0) throw new Error(`code for sample label "${label}" not found`);
  return decodeHtmlEntities(html.slice(contentIndex, endIndex).trim());
};

const tagForPath = (path: string): (typeof TAG_ORDER)[number] | undefined => {
  for (const [tag, prefixes] of Object.entries(TAG_PREFIX_MAP)) {
    if (prefixes.some((prefix) => path.startsWith(prefix))) return tag as (typeof TAG_ORDER)[number];
  }
  return undefined;
};

const recursiveKeySet = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(recursiveKeySet);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .flatMap((key) => {
        const nested = recursiveKeySet((value as Record<string, unknown>)[key]);
        return [key, ...nested.map((sub) => `${key}.${sub}`)];
      });
  }
  return [];
};

const decodeExample = (html: string, key: string): unknown => {
  const match = html.match(new RegExp(`<[^>]+data-example="${key}"[^>]*>([\\s\\S]*?)</`));
  if (!match) throw new Error(`data-example "${key}" not found`);
  return JSON.parse(decodeHtmlEntities(match[1].trim()));
};

const collectTagOrder = (spec: { tags?: unknown }): string[] => {
  if (!Array.isArray(spec.tags)) return [];
  return spec.tags.flatMap((tag) => {
    if (tag && typeof tag === "object" && "name" in tag && typeof (tag as { name: unknown }).name === "string") {
      return [(tag as { name: string }).name];
    }
    return [];
  });
};

const readPath = (spec: unknown, path: ReadonlyArray<string>): unknown => {
  let cursor: unknown = spec;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const requestBodyJsonSchema = (spec: unknown, pathKey: string, methodKey: string): Record<string, unknown> | undefined => {
  const node = readPath(spec, ["paths", pathKey, methodKey, "requestBody", "content", "application/json", "schema"]);
  return node && typeof node === "object" ? (node as Record<string, unknown>) : undefined;
};

const operationParameters = (spec: unknown, pathKey: string, methodKey: string): Array<{ name: string; in: string; schema?: Record<string, unknown>; description?: string; example?: unknown }> => {
  const node = readPath(spec, ["paths", pathKey, methodKey, "parameters"]);
  return Array.isArray(node) ? (node as Array<{ name: string; in: string; schema?: Record<string, unknown>; description?: string; example?: unknown }>) : [];
};

Bun.env.BASE_URL ??= "http://127.0.0.1:8788";
Bun.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1/unused";
Bun.env.MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type FullSpec = {
  openapi: string;
  info: { title: string; version: string; description: string };
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, { tags?: string[]; parameters?: Array<{ name: string; in: string }> }>>;
  components?: { schemas?: Record<string, { description?: string; example?: unknown; properties?: Record<string, unknown> }> };
};

const appModule = await import("../src/app.ts");
const { createApp } = appModule;

const buildFullApp = () => {
  const inertDb = {} as never;
  const inertPayments = {
    createPayment: () => Promise.reject(new Error("inert")),
    getPayment: () => Promise.reject(new Error("inert")),
    listPayments: () => Promise.reject(new Error("inert")),
    cancelPayment: () => Promise.reject(new Error("inert")),
  } as never;
  const inertEvents = {} as never;
  const chainState: ChainState = { chain: "reconnecting", pendingSubscriptions: 0 };
  const dependencies: AppDependencies = {
    db: inertDb,
    payments: inertPayments,
    events: inertEvents,
    getChainState: () => chainState,
  };
  return createApp(dependencies);
};

const fetchOpenApiSpec = async (): Promise<FullSpec> => {
  const app = buildFullApp();
  const response = await app.fetch(new Request("http://example.test/openapi.json"));
  expect(response.status).toBe(200);
  return (await response.json()) as FullSpec;
};

const fullSpec = await fetchOpenApiSpec();

describe("Documentation routes", () => {
  describe("isolated /docs fixture", () => {
    const isolatedApp = createDocsRoutes();

    it("serves /docs, /docs/reference, and /openapi.json", async () => {
      const docsResponse = await isolatedApp.fetch(new Request("http://example.test/docs"));
      expect(docsResponse.status).toBe(200);
      expect(docsResponse.headers.get("content-type")).toContain("text/html");

      const referenceResponse = await isolatedApp.fetch(new Request("http://example.test/docs/reference"));
      expect(referenceResponse.status).toBe(200);
      expect(referenceResponse.headers.get("content-type")).toContain("text/html");

      const specResponse = await isolatedApp.fetch(new Request("http://example.test/openapi.json"));
      expect(specResponse.status).toBe(200);
      const spec = (await specResponse.json()) as FullSpec;
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toBe("Payment Processor API");
    });
  });
  describe("dashboard redirect", () => {
    it("redirects /dashboard to the configured dashboard URL", async () => {
      const response = await buildFullApp().fetch(new Request("http://example.test/dashboard"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("http://localhost:5175");
    });
  });

  describe("request logging", () => {
    it("echoes a supplied request ID and generates one when absent", async () => {
      const app = buildFullApp();
      const supplied = await app.fetch(new Request("http://example.test/openapi.json", { headers: { "x-request-id": "trace-123" } }));
      const generated = await app.fetch(new Request("http://example.test/openapi.json"));
      expect(supplied.headers.get("x-request-id")).toBe("trace-123");
      expect(generated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("guide content contracts", () => {
    const isolatedApp = createDocsRoutes();
    let docsHtml: string;
    let referenceHtml: string;

    beforeAll(async () => {
      docsHtml = await (await isolatedApp.fetch(new Request("http://example.test/docs"))).text();
      referenceHtml = await (await isolatedApp.fetch(new Request("http://example.test/docs/reference"))).text();
    });

    it("renders the four ordered sections with their exact heading and deep-link mapping", () => {
      const sections = [
        ["create-an-api-key", "Create an API key"],
        ["register-a-webhook", "Register a webhook"],
        ["create-a-payment-qr", "Create a payment QR"],
        ["subscribe-to-events", "Subscribe to events"],
      ] as const;
      let previousSectionIndex = -1;

      for (const [id, heading] of sections) {
        const sectionIndex = docsHtml.indexOf(`<section class="step" id="${id}">`);
        const sectionEnd = docsHtml.indexOf("</section>", sectionIndex);
        const headingIndex = docsHtml.indexOf(`<h2>${heading}</h2>`, sectionIndex);
        expect(sectionIndex).toBeGreaterThan(previousSectionIndex);
        expect(headingIndex).toBeGreaterThan(sectionIndex);
        expect(headingIndex).toBeLessThan(sectionEnd);
        expect(docsHtml).toContain(`href="#${id}"`);
        previousSectionIndex = sectionIndex;
      }
    });

    it("renders the exact hero", () => {
      expect(docsHtml).toContain('<p class="kicker">PAYMENT PROCESSOR API</p>');
      expect(docsHtml).toContain("Create an API key, present a server-generated payment QR, and receive signed payment updates.");
    });

    it("links to the dashboard and the API reference", () => {
      expect(docsHtml).toMatch(/href="\/dashboard"/);
      expect(docsHtml).toMatch(/href="\/docs\/reference"/);
      expect(docsHtml).toContain("Open dashboard");
      expect(docsHtml).toContain("Browse API reference");
    });

    it("documents the four primary v1 routes", () => {
      for (const route of ["/v1/api_keys", "/v1/webhook_endpoints", "/v1/payments", "/v1/events"]) {
        expect(docsHtml).toContain(route);
      }
    });

    it("shows the invalid_events error response", () => {
      expect(docsHtml).toContain("invalid_events");
      expect(docsHtml).toContain("At least one event must be selected.");
    });

    it("contains no API-key input control on the docs page", () => {
      expect(docsHtml).not.toMatch(/<input[^>]+name="api[_]?key"/i);
      expect(docsHtml).not.toMatch(/<textarea[^>]+name="api[_]?key"/i);
      expect(docsHtml).not.toMatch(/<input[^>]+type="password"/i);
    });

    it("embeds all six stable data-example keys", () => {
      for (const key of EXAMPLE_KEYS) {
        expect(docsHtml).toContain(`data-example="${key}"`);
      }
    });

    it("documents the receiver's complete signature-verification and retry contract", () => {
      const receiver = labeledCode(docsHtml, "server.mjs");
      expect(receiver).toContain('const SIGNATURE = /^t=([0-9]+),v1=([0-9a-f]{64})$/;');
      expect(receiver).toContain('app.post("/webhooks/payment-processor", express.raw({ type: "application/json" }), (req, res) => {');
      expect(receiver).not.toContain("express.json(");
      expect(receiver).toContain('const header = req.headers["payment-processor-signature"];');
      expect(receiver).toContain('const match = typeof header === "string" ? SIGNATURE.exec(header) : null;');
      expect(receiver.indexOf("express.raw")).toBeLessThan(receiver.indexOf("JSON.parse(req.body"));
      expect(receiver).toContain("return res.status(204).end();");
      expect(receiver).toContain("return res.status(500).end();");
    });
    it("ships a runnable Node webhook receiver named server.mjs", () => {
      expect(docsHtml).toContain("server.mjs");
      expect(docsHtml).toMatch(/PAYMENT_PROCESSOR_WEBHOOK_SECRET/);
      expect(docsHtml).toContain("payment-processor-signature");
      expect(docsHtml).toMatch(/timingSafeEqual/);
      expect(docsHtml).toMatch(/express\.raw/);
      expect(docsHtml).toMatch(/payment\.received/);
    });

    it("keeps sensitive placeholders inert in copy targets", () => {
      expect(docsHtml).not.toMatch(/payment_processor_sk_[A-Za-z0-9_-]{16,}/);
      expect(docsHtml).not.toMatch(/whsec_[A-Za-z0-9_-]{16,}/);
    });

    it("configures Scalar at /docs/reference against /openapi.json", () => {
      expect(referenceHtml).toContain("/openapi.json");
      expect(referenceHtml).toContain("Payment Processor API Reference");
    });
  });

  describe("guide data-example payloads", () => {
    const isolatedApp = createDocsRoutes();
    let docsHtml: string;

    beforeAll(async () => {
      docsHtml = await (await isolatedApp.fetch(new Request("http://example.test/docs"))).text();
    });

    const decode = (key: (typeof EXAMPLE_KEYS)[number]): unknown => decodeExample(docsHtml, key);

    it("API key response example parses against the exported schema and exposes every documented value", () => {
      const parsed = decode("api-key-response") as Record<string, unknown>;
      expect(apiKeySecretSchema.safeParse(parsed).success).toBe(true);
      expect(recursiveKeySet(parsed).sort()).toEqual([...API_KEY_RESPONSE_KEYS].sort());
      expect(parsed).toEqual(API_KEY_RESPONSE_EXAMPLE);
    });

    it("webhook request example parses against the exported schema with exact values", () => {
      const parsed = decode("webhook-request") as Record<string, unknown>;
      expect(createWebhookEndpointBodySchema.safeParse(parsed).success).toBe(true);
      expect(parsed).toEqual(WEBHOOK_REQUEST_EXAMPLE);
    });

    it("webhook response example parses against the exported schema with every documented value", () => {
      const parsed = decode("webhook-response") as Record<string, unknown>;
      expect(webhookEndpointSecretSchema.safeParse(parsed).success).toBe(true);
      expect(recursiveKeySet(parsed).sort()).toEqual([...WEBHOOK_RESPONSE_KEYS].sort());
      expect(parsed).toEqual(WEBHOOK_RESPONSE_EXAMPLE);
    });

    it("payment request example parses against the exported schema with every documented value", () => {
      const parsed = decode("payment-request") as Record<string, unknown>;
      expect(createPaymentBodySchema.safeParse(parsed).success).toBe(true);
      expect(recursiveKeySet(parsed).sort()).toEqual([...PAYMENT_REQUEST_KEYS].sort());
      expect(parsed).toEqual(PAYMENT_REQUEST_EXAMPLE);
    });

    it("payment response example decodes HTML entities and preserves every documented value", () => {
      const parsed = decode("payment-response") as Record<string, unknown>;
      expect(paymentSchema.safeParse(parsed).success).toBe(true);
      expect(recursiveKeySet(parsed).sort()).toEqual([...PAYMENT_RESPONSE_KEYS].sort());
      expect(parsed).toEqual(PAYMENT_RESPONSE_EXAMPLE);
    });

    it("labels the representative failure HTTP 400 and documents its exact envelope", () => {
      expect(exampleLabel(docsHtml, "invalid-events-error")).toBe("Response — 400 Bad Request");
      expect(decode("invalid-events-error")).toEqual(INVALID_EVENTS_ERROR_EXAMPLE);
    });
  });

  describe("openapi.json contract", () => {
    it("is OpenAPI 3.1.0 with the expected title/version/description", () => {
      expect(fullSpec.openapi).toBe("3.1.0");
      expect(fullSpec.info.title).toBe("Payment Processor API");
      expect(fullSpec.info.version).toBe("1.0.0");
      expect(fullSpec.info.description).toContain("/docs");
      expect(fullSpec.info.description).toContain("integration guide");
    });

    it("lists the six tags in canonical order with exact descriptions", () => {
      expect(collectTagOrder(fullSpec)).toEqual([...TAG_ORDER]);
      for (const tag of TAG_ORDER) {
        expect(fullSpec.tags).toContainEqual({ name: tag, description: TAG_DESCRIPTIONS[tag] });
      }
    });

    it("registers exactly the documented operation tag map with no extras or missing operations", () => {
      const discovered = new Map<string, string[]>();
      for (const [path, item] of Object.entries(fullSpec.paths)) {
        for (const method of HTTP_METHODS) {
          const operation = (item as Record<string, unknown>)[method];
          if (!operation || typeof operation !== "object") continue;
          discovered.set(`${method.toUpperCase()} ${path}`, (operation as { tags?: string[] }).tags ?? []);
        }
      }
      const expected = new Map<string, string>(
        EXPECTED_OPERATIONS.map(([method, path]) => [`${method} ${path}`, tagForPath(path) ?? ""]),
      );
      expect([...discovered.keys()].sort()).toEqual([...expected.keys()].sort());
      for (const [key, tags] of discovered) {
        const expectedTag = expected.get(key);
        if (!expectedTag) throw new Error(`Unexpected OpenAPI operation: ${key}`);
        expect(tags).toEqual([expectedTag]);
      }
    });

    it("preserves exact bearer security on the selected authenticated operations", () => {
      for (const [path, method] of [
        ["/v1/payments", "post"],
        ["/v1/webhook_endpoints", "post"],
        ["/v1/api_keys", "post"],
        ["/v1/events", "get"],
      ] as const) {
        expect(readPath(fullSpec, ["paths", path, method, "security"])).toEqual(BEARER_SECURITY);
      }
    });
    it("defines the bearer scheme used by Scalar's authorization control", () => {
      expect(readPath(fullSpec, ["components", "securitySchemes", "bearerAuth"])).toEqual({
        type: "http",
        scheme: "bearer",
      });
    });

    it("documents API-key label and secret at their generated schema paths", () => {
      const apiKeyBody = requestBodyJsonSchema(fullSpec, "/v1/api_keys", "post");
      expect(readPath(apiKeyBody, ["properties", "label"])).toMatchObject({
        description: "Human-friendly label so the merchant can tell keys apart in the dashboard.",
        example: "Production",
      });
      expect(readPath(fullSpec, ["paths", "/v1/api_keys", "post", "responses", "201", "content", "application/json", "schema", "properties", "secret"])).toMatchObject({
        description:
          "Bearer secret for the API key, returned in full exactly once on create or rotate. Treat it like a password; the dashboard and /v1/api_keys responses never expose it again.",
        example: "payment_processor_sk_...",
      });
    });

    it("documents webhook create/update fields and returned secret with exact descriptions and examples", () => {
      const eventTypes = ["payment.created", "payment.received", "payment.settling", "payment.confirming", "payment.settled", "payment.failed", "payment.expired", "payment.canceled", "test.ping"];
      const createBody = requestBodyJsonSchema(fullSpec, "/v1/webhook_endpoints", "post");
      expect(readPath(createBody, ["properties", "url"])).toMatchObject({
        description: "Public HTTPS endpoint that will receive signed webhook deliveries. Only http(s) URLs are accepted.",
        example: "https://merchant.example/webhooks/payment-processor",
      });
      expect(readPath(createBody, ["properties", "events"])).toMatchObject({
        description: "Event types this endpoint is subscribed to. Omit to subscribe to every event type. An empty array is rejected.",
        example: eventTypes,
      });
      const updateBody = requestBodyJsonSchema(fullSpec, "/v1/webhook_endpoints/{id}", "patch");
      expect(readPath(updateBody, ["properties", "url"])).toMatchObject({
        description: "Public HTTPS endpoint that will receive signed webhook deliveries. Only http(s) URLs are accepted.",
        example: "https://merchant.example/webhooks/payment-processor",
      });
      expect(readPath(updateBody, ["properties", "events"])).toMatchObject({
        description: "Event types this endpoint is subscribed to. Omit to keep the existing subscription. An empty array is rejected.",
        example: eventTypes,
      });
      expect(readPath(fullSpec, ["paths", "/v1/webhook_endpoints", "post", "responses", "201", "content", "application/json", "schema", "properties", "secret"])).toMatchObject({
        description:
          "Webhook signing secret, returned in full only on create or rotate. Use it to verify the payment-processor-signature header on every delivery.",
        example: "whsec_...",
      });
    });

    it("documents every create-payment field and idempotency-key with exact descriptions and examples", () => {
      const fields: ReadonlyArray<readonly [string, string, unknown]> = [
        ["amount", 'Charge amount as a decimal string with up to two fractional digits. Trimmed, must be greater than zero and at most 10000.00; rendered with Number(...).toFixed(2) (so "12" becomes "12.00").', "12.50"],
        ["currency", "Only the CASH currency is supported.", "CASH"],
        ["description", "Optional merchant-facing description, at most 500 characters.", "Order #1234"],
        ["reference", "Optional merchant-side reference id, at most 500 characters.", "ord_1234"],
        ["metadata", "Optional metadata object. Serialized with JSON.stringify; the UTF-8 byte length must not exceed 4096.", { order_id: "ord_1234" }],
        ["display_name", "Optional merchant display name shown to the payer (at most 120 characters).", "Acme Store"],
        ["expires_in", "Lifetime of the payment in seconds. Defaults to 900; must be an integer from 60 through 86400.", 900],
      ];
      for (const [field, description, example] of fields) {
        expect(readPath(fullSpec, ["components", "schemas", "CreatePaymentRequest", "properties", field])).toMatchObject({ description, example });
      }
      const idempotency = operationParameters(fullSpec, "/v1/payments", "post").find(
        (parameter) => parameter.in === "header" && parameter.name === "idempotency-key",
      );
      expect(idempotency?.schema).toMatchObject({
        description:
          "Optional caller-supplied key (e.g. order id) that makes POST /v1/payments safe to retry. Resending the same key with the same normalized amount returns the original payment; resending with a different normalized amount returns HTTP 409. Other request fields are not compared for idempotency conflicts.",
        example: "order-1234",
      });
    });

    it("documents every events-list query parameter with exact descriptions and examples", () => {
      const parameters = operationParameters(fullSpec, "/v1/events", "get");
      const findByName = (name: string) => parameters.find((parameter) => parameter.in === "query" && parameter.name === name);
      expect(findByName("type")?.schema).toMatchObject({
        description: "Filter the event log to a single event type.",
        example: "payment.received",
      });
      expect(findByName("limit")?.schema).toMatchObject({
        description: "Maximum number of events to return per page (1-100, default 25).",
        example: 25,
      });
      expect(findByName("starting_after")?.schema).toMatchObject({
        description: "Cursor for pagination. When the previous response's has_more is true, pass the last item's id to fetch the next page.",
        example: "evt_01K0PAYMENTPROCESSOR0000000000000000",
      });
      expect(eventsListQuerySchema.safeParse({ type: "payment.received", limit: 25, starting_after: "evt_01K0PAYMENTPROCESSOR0000000000000000" }).success).toBe(true);
    });

    it("preserves createPaymentBodySchema validation rules", () => {
      expect(createPaymentBodySchema.safeParse({ amount: "12.50", currency: "CASH" }).success).toBe(true);
      expect(createPaymentBodySchema.safeParse({ amount: 12.5 }).success).toBe(false);
      expect(createPaymentBodySchema.safeParse({ amount: "1", description: "x".repeat(501) }).success).toBe(false);
    });

    it("preserves updateWebhookEndpointBodySchema validation", () => {
      expect(updateWebhookEndpointBodySchema.safeParse({ url: "https://merchant.example/webhooks/payment-processor" }).success).toBe(true);
      expect(updateWebhookEndpointBodySchema.safeParse({ url: "not-a-url" }).success).toBe(false);
    });

    it("preserves createApiKeyBodySchema validation", () => {
      expect(createApiKeyBodySchema.safeParse({ label: "Production" }).success).toBe(true);
    });
  });
});
