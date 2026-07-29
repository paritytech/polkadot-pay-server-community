// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";

import { ed25519 } from "@noble/curves/ed25519.js";

import {
  buildAuthorizeValueTransfer,
  valueTransferImplication,
} from "../src/modules/settlement/settlement.chain.ts";
import { blake2_256 } from "../src/modules/settlement/coinage/scale.ts";

const AUTHORIZATION_KEY = new Uint8Array(32).fill(7);
const CALL_BYTES = new Uint8Array([0x44, 0x01, 0xaa, 0xbb]);
const OWN_EXPLICIT = new Uint8Array([0x00]);
const FOLLOWING = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
const SIGNING_PAYLOAD = new Uint8Array([...CALL_BYTES, ...OWN_EXPLICIT, ...FOLLOWING]);

describe("valueTransferImplication", () => {
  it("encodes base ++ following data, dropping the extension's own explicit byte", () => {
    const implication = valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD);

    expect(Array.from(implication)).toEqual([0x00, ...CALL_BYTES, ...FOLLOWING]);
  });

  it("prefixes the zero extension-version byte required by TxBaseImplication", () => {
    expect(valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD)[0]).toBe(0x00);
  });

  it("excludes the byte at the call boundary so a Some/None explicit never shifts the payload", () => {
    const asSome = new Uint8Array([...CALL_BYTES, 0x01, ...FOLLOWING]);

    expect(Array.from(valueTransferImplication(CALL_BYTES, asSome))).toEqual(
      Array.from(valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD)),
    );
  });

  it("changes when the call changes", () => {
    const other = new Uint8Array([0x44, 0x01, 0xcc, 0xdd]);
    const a = valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD);
    const b = valueTransferImplication(other, new Uint8Array([...other, ...OWN_EXPLICIT, ...FOLLOWING]));

    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("changes when the following implicit data changes", () => {
    const shifted = new Uint8Array([...CALL_BYTES, ...OWN_EXPLICIT, 0x09, 0x02, 0x03, 0x04, 0x05]);
    const a = valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD);
    const b = valueTransferImplication(CALL_BYTES, shifted);

    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("buildAuthorizeValueTransfer", () => {
  it("returns undefined when no authorization key is configured", () => {
    expect(buildAuthorizeValueTransfer(undefined, CALL_BYTES)).toBeUndefined();
  });

  it("signs blake2_256 of the implication so the runtime's ed25519_verify passes", () => {
    const implication = valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD);
    const signature = buildAuthorizeValueTransfer(AUTHORIZATION_KEY, implication);
    expect(signature).toMatch(/^0x[0-9a-f]{128}$/);

    const sigBytes = Uint8Array.from(Buffer.from(signature!.slice(2), "hex"));
    const publicKey = ed25519.getPublicKey(AUTHORIZATION_KEY);
    expect(ed25519.verify(sigBytes, blake2_256(implication), publicKey)).toBe(true);
  });

  it("fails verification against a different implication", () => {
    const signature = buildAuthorizeValueTransfer(
      AUTHORIZATION_KEY,
      valueTransferImplication(CALL_BYTES, SIGNING_PAYLOAD),
    );
    const sigBytes = Uint8Array.from(Buffer.from(signature!.slice(2), "hex"));
    const publicKey = ed25519.getPublicKey(AUTHORIZATION_KEY);
    const otherCall = new Uint8Array([0x44, 0x01, 0xcc, 0xdd]);
    const wrong = blake2_256(
      valueTransferImplication(otherCall, new Uint8Array([...otherCall, ...OWN_EXPLICIT, ...FOLLOWING])),
    );

    expect(ed25519.verify(sigBytes, wrong, publicKey)).toBe(false);
  });
});
