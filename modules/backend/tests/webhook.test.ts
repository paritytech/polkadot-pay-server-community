// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";

import { EventsService } from "../src/modules/events/events.service.ts";
import { WebhookDispatcher } from "../src/modules/webhooks/webhooks.dispatcher.ts";
import {
  createWebhookEndpoint,
  findEvent,
  insertWebhookDelivery,
  listEventDeliverySummaries,
} from "../src/modules/webhooks/webhooks.repo.ts";
import type { PaymentPublic } from "../src/modules/payments/payments.types.ts";
import { createTestDatabase, seedMerchantWithKey } from "./helpers/payment-fixture.ts";
import { seal } from "../src/lib/crypto.ts";
import { webhookEndpointId } from "../src/lib/ids.ts";

function samplePayment(id: string): PaymentPublic {
  return {
    id,
    object: "payment",
    status: "received",
    amount: "3.00",
    currency: "CASH",
    description: null,
    reference: null,
    metadata: {},
    display_name: "Webhook Merchant",
    payment_url: `http://localhost/pay/${id}`,
    qr: {
      deeplink: `polkadotapp://pay/cheque?id=${id}`,
      png: `http://localhost/pay/${id}/qr.png`,
      svg: `http://localhost/pay/${id}/qr.svg`,
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
    paid: { amount: "3.00", coin_count: 1, payer_timestamp_ms: 1770000000000 },
    created_at: new Date(0).toISOString(),
    expires_at: new Date(1).toISOString(),
    received_at: new Date(2).toISOString(),
    completed_at: null,
    canceled_at: null,
  };
}

describe("WebhookDispatcher", () => {
  it("signs and delivers a payment.received event", async () => {
    const db = await createTestDatabase("webhook_success");
    const { merchant } = await seedMerchantWithKey(db, "Webhook Merchant");
    const secret = "whsec_test_secret";
    const received: { headers: Headers; body: string }[] = [];
    const server = Bun.serve({
      port: 10091,
      async fetch(request) {
        received.push({ headers: request.headers, body: await request.text() });
        return new Response("ok", { status: 200 });
      },
    });

    await createWebhookEndpoint(db, {
      id: webhookEndpointId(),
      merchant_id: merchant.id,
      url: "http://127.0.0.1:10091/hook",
      events: JSON.stringify(["payment.received"]),
      secret_enc: seal(new TextEncoder().encode(secret)),
      status: "enabled",
      created_at: Date.now(),
      deleted_at: null,
    });

    const events = new EventsService();
    await events.emit(db, merchant.id, "payment.received", samplePayment("pay_webhook"), "pay_webhook");

    const dispatcher = new WebhookDispatcher(db, 60_000);
    await dispatcher.flushDue();
    dispatcher.stop();
    server.stop(true);

    expect(received.length).toBe(1);
    const delivery = received[0];
    const signature = delivery.headers.get("payment-processor-signature");
    expect(signature).toBeString();
    const [timePart, v1Part] = signature!.split(",");
    const timestamp = timePart.replace("t=", "");
    const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${delivery.body}`).digest("hex");
    expect(v1Part).toBe(`v1=${expected}`);
    expect(JSON.parse(delivery.body).type).toBe("payment.received");
  });

  it("retries after a 500 and succeeds on the next attempt", async () => {
    const db = await createTestDatabase("webhook_retry");
    const { merchant } = await seedMerchantWithKey(db, "Retry Merchant");
    const secret = "whsec_retry_secret";
    let attempts = 0;
    const server = Bun.serve({
      port: 10092,
      fetch() {
        attempts += 1;
        return new Response(attempts === 1 ? "fail" : "ok", { status: attempts === 1 ? 500 : 200 });
      },
    });

    const endpointId = webhookEndpointId();
    await createWebhookEndpoint(db, {
      id: endpointId,
      merchant_id: merchant.id,
      url: "http://127.0.0.1:10092/hook",
      events: JSON.stringify(["payment.received"]),
      secret_enc: seal(new TextEncoder().encode(secret)),
      status: "enabled",
      created_at: Date.now(),
      deleted_at: null,
    });

    const events = new EventsService();
    const eventIdValue = await events.emit(db, merchant.id, "payment.received", samplePayment("pay_retry"), "pay_retry");
    const dispatcher = new WebhookDispatcher(db, 60_000);
    await dispatcher.flushDue();
    await db.execute("UPDATE webhook_deliveries SET next_attempt_at = 0 WHERE event_id = $1", [eventIdValue]);
    await dispatcher.flushDue();
    dispatcher.stop();
    server.stop(true);

    const deliveries = await listEventDeliverySummaries(db, eventIdValue);
    expect(attempts).toBe(2);
    expect(deliveries[0]?.status).toBe("succeeded");
    expect(deliveries[0]?.attempt_count).toBe(2);
  });

  it("marks a delivery failed after seven attempts", async () => {
    const db = await createTestDatabase("webhook_failed");
    const { merchant } = await seedMerchantWithKey(db, "Failure Merchant");
    const secret = "whsec_failure_secret";
    const server = Bun.serve({
      port: 10093,
      fetch() {
        return new Response("nope", { status: 500 });
      },
    });

    await createWebhookEndpoint(db, {
      id: webhookEndpointId(),
      merchant_id: merchant.id,
      url: "http://127.0.0.1:10093/hook",
      events: JSON.stringify(["payment.received"]),
      secret_enc: seal(new TextEncoder().encode(secret)),
      status: "enabled",
      created_at: Date.now(),
      deleted_at: null,
    });

    const events = new EventsService();
    const eventIdValue = await events.emit(db, merchant.id, "payment.received", samplePayment("pay_fail"), "pay_fail");
    const dispatcher = new WebhookDispatcher(db, 60_000);
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await db.execute("UPDATE webhook_deliveries SET next_attempt_at = 0 WHERE event_id = $1", [eventIdValue]);
      await dispatcher.flushDue();
    }
    dispatcher.stop();
    server.stop(true);

    const event = await findEvent(db, merchant.id, eventIdValue);
    const deliveries = event ? await listEventDeliverySummaries(db, event.id) : [];
    expect(deliveries[0]?.status).toBe("failed");
    expect(deliveries[0]?.attempt_count).toBe(7);
  });
});
