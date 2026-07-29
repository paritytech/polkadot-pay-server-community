// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
/**
 * Missing, malformed, and incorrect signup codes must never create an account.
 * These tests exercise validation before any persistence is attempted.
 */
import { describe, expect, it } from "bun:test";
import "./helpers/test-env.ts";

import { createApp } from "../src/app.ts";
import type { Database } from "../src/db/client.ts";
import { EventsService } from "../src/modules/events/events.service.ts";
import { PaymentsService } from "../src/modules/payments/payments.service.ts";
const CONFIGURED_CODE = "test-signup-code";

function buildApp() {
  const db = undefined as unknown as Database;
  return createApp({
    db,
    payments: new PaymentsService({ db }),
    events: new EventsService(),
    getChainState: () => ({ chain: "reconnecting", pendingSubscriptions: 0 }),
  });
}

function createSignupRequest(body: unknown): Request {
  return new Request("http://example.test/v1/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSignupRequestRaw(rawBody: string): Request {
  return new Request("http://example.test/v1/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("POST /v1/accounts — SIGNUP_CODE guard", () => {

  it("rejects signup with a missing signup_code field", async () => {
    const app = await buildApp();

    const response = await app.fetch(createSignupRequest({ name: "NoCode" }));

    expect(response.status).toBe(400);
  });

  it("rejects signup with an empty signup_code string", async () => {
    const app = await buildApp();

    const response = await app.fetch(createSignupRequest({ name: "Empty", signup_code: "" }));

    expect(response.status).toBe(400);
  });

  it("rejects signup when the signup_code does not match SIGNUP_CODE", async () => {
    const app = await buildApp();

    const response = await app.fetch(createSignupRequest({ name: "Wrong", signup_code: "not-the-shared-secret" }));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; param: string } };
    expect(body.error.code).toBe("invalid_signup_code");
    expect(body.error.param).toBe("signup_code");
  });

  it("rejects signup with a subtle near-match (trailing whitespace, case)", async () => {
    const app = await buildApp();

    const padded = await app.fetch(createSignupRequest({ name: "Padded", signup_code: CONFIGURED_CODE + " " }));
    expect(padded.status).toBe(403);
    const paddedBody = (await padded.json()) as { error: { code: string } };
    expect(paddedBody.error.code).toBe("invalid_signup_code");

    const cased = await app.fetch(createSignupRequest({ name: "Cased", signup_code: CONFIGURED_CODE.toUpperCase() }));
    expect(cased.status).toBe(403);
    const casedBody = (await cased.json()) as { error: { code: string } };
    expect(casedBody.error.code).toBe("invalid_signup_code");
  });

  it("rejects raw JSON that omits signup_code entirely", async () => {
    const app = await buildApp();

    const response = await app.fetch(createSignupRequestRaw(JSON.stringify({ name: "RawNoCode" })));

    expect(response.status).toBe(400);
  });

  it("rejects signup_code that is structurally a non-string (number)", async () => {
    const app = await buildApp();

    const response = await app.fetch(createSignupRequestRaw(JSON.stringify({ name: "Numeric", signup_code: 12345 })));

    expect(response.status).toBe(400);
  });
});
