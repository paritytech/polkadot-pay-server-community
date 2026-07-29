// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { errorSchema } from "../api/api.schema";
import { qrPng, qrSvg } from "../../lib/qr";
import type { AppEnv } from "../../types";
import { toPublicPaymentStatus } from "./payments.public";
import type { PaymentsService } from "./payments.service";
import { paymentParamsSchema, publicPaymentStatusSchema } from "./payments.schema";
import type { PaymentStatus } from "./payments.types";

const publicStatusRoute = createRoute({
  method: "get",
  path: "/public/payments/{id}/status",
  tags: ["Public"],
  summary: "Read public payment status",
  request: { params: paymentParamsSchema },
  responses: {
    200: {
      description: "Public payment status",
      content: { "application/json": { schema: publicPaymentStatusSchema } },
    },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const publicSvgRoute = createRoute({
  method: "get",
  path: "/public/payments/{id}/qr.svg",
  tags: ["Public"],
  summary: "Render payment QR SVG",
  request: { params: paymentParamsSchema },
  responses: {
    200: { description: "SVG image" },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const publicPngRoute = createRoute({
  method: "get",
  path: "/public/payments/{id}/qr.png",
  tags: ["Public"],
  summary: "Render payment QR PNG",
  request: { params: paymentParamsSchema },
  responses: {
    200: { description: "PNG image" },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

const hostedPageRoute = createRoute({
  method: "get",
  path: "/pay/{id}",
  tags: ["Public"],
  summary: "Hosted payment page",
  request: { params: paymentParamsSchema },
  responses: {
    200: { description: "Hosted HTML payment page" },
    404: { description: "Payment not found", content: { "application/json": { schema: errorSchema } } },
  },
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Friendly merchant-facing copy and CSS class for every status the hosted page may render. */
const HOSTED_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Waiting for payment",
  received: "\u2713 Payment received",
  settling: "Settling payment",
  confirming: "Confirming on-chain",
  settled: "\u2713 Payment settled",
  expired: "Payment expired",
  canceled: "Payment canceled",
  failed: "Settlement failed",
};
const HOSTED_STATUS_CLASSES: Partial<Record<PaymentStatus, string>> = {
  received: "paid",
  settled: "paid",
  expired: "expired",
};
const TERMINAL_STATUSES: Partial<Record<PaymentStatus, true>> = {
  settled: true,
  expired: true,
  canceled: true,
  failed: true,
};

function renderHostedPage(payment: {
  id: string;
  amount: string;
  display_name: string | null;
  status: PaymentStatus;
  expires_at: string;
  deeplink: string;
  qrSvg: string;
}): string {
  const label = escapeHtml(payment.display_name ?? "Polkadot coinage payment");
  const amount = escapeHtml(payment.amount);
  const deeplink = escapeHtml(payment.deeplink);
  const expiresAt = escapeHtml(payment.expires_at);
  const paymentId = escapeHtml(payment.id);
  const statusLabel = escapeHtml(HOSTED_STATUS_LABELS[payment.status] ?? payment.status);
  const statusClass = escapeHtml(HOSTED_STATUS_CLASSES[payment.status] ?? '');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${label}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f6f7f9; color: #111827; margin: 0; }
      main { max-width: 480px; margin: 0 auto; padding: 32px 20px 48px; }
      .card { background: white; border-radius: 20px; padding: 24px; box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08); }
      h1 { margin: 0 0 8px; font-size: 28px; }
      p { margin: 0 0 16px; color: #4b5563; }
      .amount { font-size: 40px; font-weight: 700; margin: 16px 0; }
      .qr { display: flex; justify-content: center; padding: 12px; background: #ffffff; border-radius: 16px; }
      .button { display: inline-flex; margin-top: 16px; background: #111827; color: white; text-decoration: none; padding: 12px 16px; border-radius: 999px; font-weight: 600; }
      .muted { margin-top: 16px; font-size: 14px; color: #6b7280; }
      .status { margin-top: 20px; font-size: 16px; font-weight: 600; }
      .status.paid { color: #166534; }
      .status.expired { color: #991b1b; }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <p>${label}</p>
        <h1>Scan to pay</h1>
        <div class="amount">${amount}</div>
        <div class="qr">${payment.qrSvg}</div>
        <a class="button" href="${deeplink}">Open in Polkadot App</a>
        <div class="muted">Expires at ${expiresAt}</div>
        <div class="status ${statusClass}" id="status">${statusLabel}</div>
      </div>
    </main>
    <script>
      const statusNode = document.getElementById('status');
      const paymentId = ${JSON.stringify(paymentId)};
      const STATUS_LABELS = ${JSON.stringify(HOSTED_STATUS_LABELS)};
      const STATUS_CLASSES = ${JSON.stringify(HOSTED_STATUS_CLASSES)};
      const TERMINAL_STATUSES = ${JSON.stringify(TERMINAL_STATUSES)};
      async function refresh() {
        const response = await fetch('/public/payments/' + paymentId + '/status');
        if (!response.ok) return;
        const data = await response.json();
        const status = typeof data.status === 'string' ? data.status : '';
        const next = Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? STATUS_LABELS[status] : 'Status: ' + status;
        const nextClass = Object.prototype.hasOwnProperty.call(STATUS_CLASSES, status) ? STATUS_CLASSES[status] : '';
        statusNode.textContent = next;
        statusNode.className = 'status' + (nextClass ? ' ' + nextClass : '');
        if (TERMINAL_STATUSES[status]) {
          clearInterval(timer);
        }
      }
      const timer = setInterval(refresh, 2000);
      refresh();
    </script>
  </body>
</html>`;
}

export function createPublicPaymentRoutes(payments: PaymentsService) {
  return new OpenAPIHono<AppEnv>()
    .openapi(publicStatusRoute, async (c) => {
      const { id } = c.req.valid("param");
      const payment = await payments.getPublicPayment(id);
      return c.json(toPublicPaymentStatus(payment), 200);
    })
    .openapi(publicSvgRoute, async (c) => {
      const { id } = c.req.valid("param");
      const payment = await payments.getPublicPayment(id);
      const svg = await qrSvg(payment.deeplink);
      return c.body(svg, 200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store",
      });
    })
    .openapi(publicPngRoute, async (c) => {
      const { id } = c.req.valid("param");
      const payment = await payments.getPublicPayment(id);
      const png = await qrPng(payment.deeplink);
      return c.body(Buffer.from(png), 200, {
        "content-type": "image/png",
        "cache-control": "no-store",
      });
    })
    .openapi(hostedPageRoute, async (c) => {
      const { id } = c.req.valid("param");
      const payment = await payments.getPublicPayment(id);
      const svg = await qrSvg(payment.deeplink);
      return c.html(
        renderHostedPage({
          id: payment.id,
          amount: payment.amount,
          display_name: payment.display_name,
          status: payment.status,
          expires_at: new Date(payment.expires_at).toISOString(),
          deeplink: payment.deeplink,
          qrSvg: svg,
        }),
        200,
      );
    });
}
