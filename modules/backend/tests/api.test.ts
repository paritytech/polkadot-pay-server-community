// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";

import { createApp } from "../src/app.ts";
import { EventsService } from "../src/modules/events/events.service.ts";
import { createMerchantRecord } from "../src/modules/accounts/accounts.repo.ts";
import { findPaymentByIdAnyMerchant, findPaymentById, updatePaymentStatus } from "../src/modules/payments/payments.repo.ts";
import { PaymentsService } from "../src/modules/payments/payments.service.ts";
import { createTestDatabase, seedMerchantWithKey } from "./helpers/payment-fixture.ts";

async function jsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

describe("API routes", () => {
  it("returns 401 without an API key", async () => {
    const db = await createTestDatabase("api_auth");
    const app = createApp({
      db,
      payments: new PaymentsService({ db }),
      events: new EventsService(),
      getChainState: () => ({ chain: "reconnecting", pendingSubscriptions: 0 }),
    });

    const response = await app.fetch(new Request("http://example.test/v1/payments"));
    expect(response.status).toBe(401);
  });

  it("supports signup, payment CRUD, and idempotency conflict detection", async () => {
    const db = await createTestDatabase("api_payments");
    const app = createApp({
      db,
      payments: new PaymentsService({ db }),
      events: new EventsService(),
      getChainState: () => ({ chain: "reconnecting", pendingSubscriptions: 0 }),
    });
    const signupCode = Bun.env.SIGNUP_CODE ?? "test-signup-code";
    const signupResponse = await app.fetch(
      new Request("http://example.test/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "API Merchant", signup_code: signupCode }),
      }),
    );
    const signup = (await jsonResponse(signupResponse)) as { api_key: { secret: string; id: string } };
    const authHeaders = { authorization: `Bearer ${signup.api_key.secret}`, "content-type": "application/json" };

    const createResponse = await app.fetch(
      new Request("http://example.test/v1/payments", {
        method: "POST",
        headers: { ...authHeaders, "idempotency-key": "payment-1" },
        body: JSON.stringify({ amount: "3.00" }),
      }),
    );
    const created = (await jsonResponse(createResponse)) as { id: string; status: string };

    const idempotentResponse = await app.fetch(
      new Request("http://example.test/v1/payments", {
        method: "POST",
        headers: { ...authHeaders, "idempotency-key": "payment-1" },
        body: JSON.stringify({ amount: "3.00" }),
      }),
    );
    const idempotent = (await jsonResponse(idempotentResponse)) as { id: string };

    const conflictResponse = await app.fetch(
      new Request("http://example.test/v1/payments", {
        method: "POST",
        headers: { ...authHeaders, "idempotency-key": "payment-1" },
        body: JSON.stringify({ amount: "4.00" }),
      }),
    );

    const getResponse = await app.fetch(
      new Request(`http://example.test/v1/payments/${created.id}`, { headers: { authorization: `Bearer ${signup.api_key.secret}` } }),
    );
    const fetched = (await jsonResponse(getResponse)) as { id: string; status: string };

    const listResponse = await app.fetch(
      new Request("http://example.test/v1/payments", { headers: { authorization: `Bearer ${signup.api_key.secret}` } }),
    );
    const listed = (await jsonResponse(listResponse)) as { data: Array<{ id: string }>; has_more: boolean };

    const cancelResponse = await app.fetch(
      new Request(`http://example.test/v1/payments/${created.id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${signup.api_key.secret}` },
      }),
    );
    const canceled = (await jsonResponse(cancelResponse)) as { status: string };

    const cancelAgainResponse = await app.fetch(
      new Request(`http://example.test/v1/payments/${created.id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${signup.api_key.secret}` },
      }),
    );

    expect(signupResponse.status).toBe(201);
    expect(createResponse.status).toBe(201);
    expect(created.status).toBe("pending");
    expect(idempotentResponse.status).toBe(201);
    expect(idempotent.id).toBe(created.id);
    expect(conflictResponse.status).toBe(409);
    expect(fetched.id).toBe(created.id);
    expect(listed.data.length).toBe(1);
    expect(listed.has_more).toBe(false);
    expect(cancelResponse.status).toBe(200);
    expect(canceled.status).toBe("canceled");
    expect(cancelAgainResponse.status).toBe(400);
  });
  it("emits payment.received exactly once across concurrent cheque redeliveries", async () => {
    const db = await createTestDatabase("api_received_dedupe");
    const payments = new PaymentsService({ db });
    const emitted: string[] = [];
    let settleable = 0;
    payments.setHooks({
      onPaymentEvent: async (_transaction, type) => {
        emitted.push(type);
      },
      onPaymentSettleable: async () => {
        settleable += 1;
      },
    });
    const merchant = { id: `mch_${crypto.randomUUID().replaceAll("-", "")}`, name: "Dedupe Merchant", created_at: Date.now() };
    await createMerchantRecord(db, merchant);
    const payment = await payments.createPayment(merchant, { amount: "6.00" });
    const payload = { amount: "6.00", timestamp: 1770000000000n, coins: [new Uint8Array(64).fill(3)] };

    await Promise.all([
      payments.completeFromCheque(payment.id, payload),
      payments.completeFromCheque(payment.id, payload),
      payments.completeFromCheque(payment.id, payload),
    ]);

    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("received");
    expect(emitted.filter((type) => type === "payment.received")).toHaveLength(1);
    expect(settleable).toBe(1);
  });

  it("guards the last active API key and reports completed volume totals", async () => {
    const db = await createTestDatabase("api_reports");
    const payments = new PaymentsService({ db });
    const app = createApp({
      db,
      payments,
      events: new EventsService(),
      getChainState: () => ({ chain: "reconnecting", pendingSubscriptions: 0 }),
    });
    const signupCode = Bun.env.SIGNUP_CODE ?? "test-signup-code";
    const signupResponse = await app.fetch(
      new Request("http://example.test/v1/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Volume Merchant", signup_code: signupCode }),
      }),
    );
    const signup = (await jsonResponse(signupResponse)) as { account: { id: string }; api_key: { secret: string; id: string } };
    const auth = { authorization: `Bearer ${signup.api_key.secret}` };

    const revokeLastKey = await app.fetch(
      new Request(`http://example.test/v1/api_keys/${signup.api_key.id}`, {
        method: "DELETE",
        headers: auth,
      }),
    );

    const first = await payments.createPayment({ id: signup.account.id, name: "Volume Merchant", created_at: Date.now() }, { amount: "2.50" });
    await payments.completeFromCheque(first.id, { amount: "2.50", timestamp: 1770000000000n, coins: [new Uint8Array(64).fill(1)] });
    const second = await payments.createPayment({ id: signup.account.id, name: "Volume Merchant", created_at: Date.now() }, { amount: "3.25" });
    await payments.completeFromCheque(second.id, { amount: "3.25", timestamp: 1770000001000n, coins: [new Uint8Array(64).fill(2)] });
    const firstReceived = await findPaymentById(db, signup.account.id, first.id);
    const secondReceived = await findPaymentById(db, signup.account.id, second.id);

    const reportResponse = await app.fetch(
      new Request("http://example.test/v1/reports/volume?interval=total", { headers: auth }),
    );
    const report = (await jsonResponse(reportResponse)) as { total: { count: number; amount: string } };

    expect(revokeLastKey.status).toBe(400);
    expect(reportResponse.status).toBe(200);
    expect(report.total.count).toBe(2);
    expect(report.total.amount).toBe("5.75");
    expect((await findPaymentById(db, signup.account.id, first.id))?.status).toBe("received");
    expect(firstReceived?.received_at).not.toBeNull();
    expect(firstReceived?.completed_at).toBeNull();
    expect(secondReceived?.received_at).not.toBeNull();
    expect(secondReceived?.completed_at).toBeNull();
  });

  it("updatePaymentStatus CAS is a no-op once the row has moved past the expected status", async () => {
    const db = await createTestDatabase("cas_status_no_op");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "4.00" });
    const settledAt = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'settled', completed_at = $2, claimed_at = $2 WHERE id = $1",
      [payment.id, settledAt],
    );

    const transitioned = await updatePaymentStatus(db, payment.id, "canceled", ["pending"], "canceled_at", Date.now());

    expect(transitioned).toBe(false);
    const after = await findPaymentById(db, merchant.id, payment.id);
    expect(after?.status).toBe("settled");
    expect(after?.canceled_at).toBeNull();
    expect(after?.completed_at).toBe(settledAt);
  });

  it("cancelPayment never overwrites a payment that settled before the cancel request", async () => {
    const db = await createTestDatabase("cancel_settled_race");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "4.00" });
    const settledAt = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'settled', completed_at = $2, claimed_at = $2 WHERE id = $1",
      [payment.id, settledAt],
    );

    await expect(payments.cancelPayment(merchant.id, payment.id)).rejects.toThrow();

    const after = await findPaymentById(db, merchant.id, payment.id);
    expect(after?.status).toBe("settled");
    expect(after?.canceled_at).toBeNull();
    expect(after?.completed_at).toBe(settledAt);
  });

  it("expirePayment never overwrites a payment that settled before the expiry sweep", async () => {
    const db = await createTestDatabase("expire_settled_race");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "4.00" });
    const settledAt = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'settled', completed_at = $2, claimed_at = $2 WHERE id = $1",
      [payment.id, settledAt],
    );

    const result = await payments.expirePayment(payment.id);
    expect(result.status).toBe("settled");

    const after = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(after?.status).toBe("settled");
    expect(after?.completed_at).toBe(settledAt);
  });
});
