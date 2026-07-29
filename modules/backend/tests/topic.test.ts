// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";

import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { deriveTopic, topicHex } from "../src/modules/payments/v1/topic.ts";

const WIRE_PREFIX = "pay-w3s:";

function referenceTopic(id: string): string {
  const prefix = new TextEncoder().encode(WIRE_PREFIX);
  const idBytes = new TextEncoder().encode(id);
  const input = new Uint8Array(prefix.length + idBytes.length);
  input.set(prefix, 0);
  input.set(idBytes, prefix.length);
  return bytesToHex(blake2b(input, { dkLen: 32 }));
}

describe("statement topic derivation", () => {
  it("uses the pay-w3s: wire prefix shared with the Android payer app", () => {
    expect(topicHex("deadbeef")).toBe(referenceTopic("deadbeef"));
  });

  it("pins a golden topic so the wire prefix cannot be renamed silently", () => {
    expect(topicHex("pay01KYFRTF8HP29FPSYNAY0GN1Y6")).toBe(
      "d836ea5ae4dcb91251bc38725d0d9133ff5538fbbc8aa0a358e1fab63e7070db",
    );
  });

  it("rejects the pre-rebrand payment-processor: prefix", () => {
    const prefix = new TextEncoder().encode("payment-processor:");
    const idBytes = new TextEncoder().encode("deadbeef");
    const input = new Uint8Array(prefix.length + idBytes.length);
    input.set(prefix, 0);
    input.set(idBytes, prefix.length);
    expect(topicHex("deadbeef")).not.toBe(bytesToHex(blake2b(input, { dkLen: 32 })));
  });

  it("derives 32 bytes and is deterministic per id", () => {
    const topic = deriveTopic("deadbeef");
    expect(topic.length).toBe(32);
    expect(Array.from(deriveTopic("deadbeef"))).toEqual(Array.from(topic));
    expect(Array.from(deriveTopic("other"))).not.toEqual(Array.from(topic));
  });
});
