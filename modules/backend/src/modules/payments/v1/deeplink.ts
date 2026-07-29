// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export const PAYMENT_PROCESSOR_DEEPLINK_BASE = "polkadotapp://pay/cheque";
export const MAX_AMOUNT = 10000;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function assertKeyShape(publicKeyCompressed: Uint8Array): void {
  if (publicKeyCompressed.length !== 33) {
    throw new Error(`compressed public key must be 33 bytes (got ${publicKeyCompressed.length})`);
  }
  if (publicKeyCompressed[0] !== 0x02 && publicKeyCompressed[0] !== 0x03) {
    throw new Error("compressed public key must use SEC1 compressed encoding");
  }
}

export function normalizeAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`invalid amount: ${JSON.stringify(amount)}`);
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(amount)}`);
  }
  if (value > MAX_AMOUNT) {
    throw new Error(`amount exceeds max ${MAX_AMOUNT}: ${amount}`);
  }

  return value.toFixed(2);
}

export interface PaymentProcessorDeeplinkParams {
  id: string;
  amount: string;
  publicKeyCompressed: Uint8Array;
  name?: string;
}

export function buildPaymentProcessorDeeplink(params: PaymentProcessorDeeplinkParams): string {
  if (!params.id || !/^[a-zA-Z0-9]+$/.test(params.id)) {
    throw new Error(`payment id must be non-empty alphanumeric: ${JSON.stringify(params.id)}`);
  }

  assertKeyShape(params.publicKeyCompressed);
  const search = new URLSearchParams({
    id: params.id,
    amount: normalizeAmount(params.amount),
    key: base64url(params.publicKeyCompressed),
  });

  const name = params.name?.trim();
  if (name) {
    search.set("name", name);
  }

  return `${PAYMENT_PROCESSOR_DEEPLINK_BASE}?${search.toString()}`;
}
