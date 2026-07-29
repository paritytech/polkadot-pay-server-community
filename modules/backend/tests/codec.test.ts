// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
/**
 * SCALE codec edge cases for the payment-processor wire contract. Pins the
 * encode/decode invariants the wire format depends on.
 */
import { describe, expect, it } from "bun:test";

import {
  CodecError,
  decodePaymentProcessorEncryptedPayloadV1,
  decodePaymentProcessorPaymentDataV1,
  encodePaymentProcessorEncryptedPayloadV1,
  encodePaymentProcessorPaymentDataV1,
  type PaymentProcessorPaymentDataV1,
} from "../src/modules/payments/v1/wire/codec.ts";

function coin(fill: number): Uint8Array {
  return new Uint8Array(64).fill(fill);
}

describe("PaymentProcessorPaymentDataV1 codec", () => {
  it("round-trips a typical multi-coin payment", () => {
    const payload: PaymentProcessorPaymentDataV1 = {
      amount: "5.00",
      timestamp: 1_700_000_000_000n,
      coins: [coin(1), coin(2), coin(3), coin(4)],
      id: "SN-1/TX-9",
    };
    const decoded = decodePaymentProcessorPaymentDataV1(encodePaymentProcessorPaymentDataV1(payload));
    expect(decoded.amount).toBe(payload.amount);
    expect(decoded.timestamp).toBe(payload.timestamp);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.coins.length).toBe(4);
    for (const [i, c] of decoded.coins.entries()) {
      expect(c.length).toBe(64);
      expect([...c].every((b) => b === i + 1)).toBe(true);
    }
  });

  it("round-trips an empty coin list (defensive: zero-amount edge)", () => {
    const payload: PaymentProcessorPaymentDataV1 = { amount: "0.00", timestamp: 0n, coins: [], id: "empty" };
    const decoded = decodePaymentProcessorPaymentDataV1(encodePaymentProcessorPaymentDataV1(payload));
    expect(decoded.coins).toEqual([]);
    expect(decoded.amount).toBe("0.00");
  });

  it("preserves a large u64 timestamp without precision loss", () => {
    const payload: PaymentProcessorPaymentDataV1 = {
      amount: "163.83",
      timestamp: 18_446_744_073_709_551_615n,
      coins: [coin(0xff)],
      id: "x",
    };
    const decoded = decodePaymentProcessorPaymentDataV1(encodePaymentProcessorPaymentDataV1(payload));
    expect(decoded.timestamp).toBe(18_446_744_073_709_551_615n);
  });

  it("rejects an amount that is not canonical X.YY on encode", () => {
    for (const bad of ["12.3", "12.345", "12", "12,34", "1e2.00", ".50", "-1.00"]) {
      expect(() =>
        encodePaymentProcessorPaymentDataV1({ amount: bad, timestamp: 1n, coins: [coin(1)], id: "x" }),
      ).toThrow(CodecError);
    }
  });

  it("rejects a non-64-byte coin (legacy 32-byte and others) on encode", () => {
    for (const len of [31, 32, 63, 65]) {
      expect(() =>
        encodePaymentProcessorPaymentDataV1({ amount: "1.00", timestamp: 1n, coins: [new Uint8Array(len)], id: "x" }),
      ).toThrow(CodecError);
    }
  });

  it("rejects decoded bytes whose coin entry is a legacy 32-byte key", () => {
    const bytes = new Uint8Array([
      0x10,
      ...new TextEncoder().encode("1.00"),
      0, 0, 0, 0, 0, 0, 0, 0,
      0x04, // vec len 1
      0x80, // compact(32)
      ...new Array(32).fill(0),
      0x04,
      ...new TextEncoder().encode("x"),
    ]);
    expect(() => decodePaymentProcessorPaymentDataV1(bytes)).toThrow(CodecError);
  });
});

describe("PaymentProcessorEncryptedPayloadV1 codec", () => {
  it("round-trips an envelope and pins the 65-byte fixed pubkey", () => {
    const ephemeral = new Uint8Array(65);
    ephemeral[0] = 0x04;
    ephemeral.fill(0x07, 1);
    const env = { encryptedData: new Uint8Array([1, 2, 3, 4, 5]), ephemeralPublicKey: ephemeral };
    const decoded = decodePaymentProcessorEncryptedPayloadV1(encodePaymentProcessorEncryptedPayloadV1(env));
    expect([...decoded.encryptedData]).toEqual([1, 2, 3, 4, 5]);
    expect(decoded.ephemeralPublicKey.length).toBe(65);
    expect(decoded.ephemeralPublicKey[0]).toBe(0x04);
  });

  it("rejects an ephemeral pubkey that is not 65 bytes on encode", () => {
    const ephemeral = new Uint8Array(33);
    ephemeral[0] = 0x02;
    expect(() =>
      encodePaymentProcessorEncryptedPayloadV1({ encryptedData: new Uint8Array([1]), ephemeralPublicKey: ephemeral }),
    ).toThrow(CodecError);
  });

  it("rejects an ephemeral pubkey with a non-0x04 prefix on decode", () => {
    const badPub = new Uint8Array(65);
    badPub[0] = 0x05;
    const bytes = new Uint8Array([0x04, 0xaa, ...badPub]);
    expect(() => decodePaymentProcessorEncryptedPayloadV1(bytes)).toThrow(CodecError);
  });
});
