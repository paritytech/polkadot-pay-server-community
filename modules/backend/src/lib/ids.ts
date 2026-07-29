// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += CROCKFORD32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += CROCKFORD32[(value << (5 - bits)) & 31];
  }

  return output;
}

function ulidTimestamp(nowMs: number): string {
  let value = BigInt(nowMs);
  let output = "";
  for (let index = 0; index < 10; index += 1) {
    output = CROCKFORD32[Number(value % 32n)] + output;
    value /= 32n;
  }
  return output;
}

function ulidRandom(): string {
  return encodeBase32(randomBytes(10)).slice(0, 16);
}

export function ulid(nowMs = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > 0xffffffffffff) {
    throw new Error(`ULID timestamp out of range: ${nowMs}`);
  }
  return `${ulidTimestamp(nowMs)}${ulidRandom()}`;
}

function prefixedId(prefix: string): string {
  return `${prefix}${ulid()}`;
}

export const paymentId = (): string => prefixedId("pay");
export const eventId = (): string => prefixedId("evt_");
export const webhookEndpointId = (): string => prefixedId("we_");
export const apiKeyId = (): string => prefixedId("key_");
export const merchantId = (): string => prefixedId("mch_");
export const webhookDeliveryId = (): string => prefixedId("whd_");
