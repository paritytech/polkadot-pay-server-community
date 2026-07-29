// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { blake2b } from "@noble/hashes/blake2.js";

export function blake2_256(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32 });
}

/** `((0u8, &call), (), ())` == `0x00 ++ call.encode()` — the implication signed by `AuthorizeValueTransfer`. */
export function inheritedImplication(callBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + callBytes.length);
  out.set(callBytes, 1);
  return out;
}
