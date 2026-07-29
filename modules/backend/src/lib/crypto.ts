// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { config } from "../env";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

export function hmacSha256Hex(key: string | Uint8Array, message: string): string {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const messageBytes = new TextEncoder().encode(message);
  return bytesToHex(hmac(sha256, keyBytes, messageBytes));
}

export function seal(plain: Uint8Array): string {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertextWithTag = gcm(config.masterKey, iv).encrypt(plain);
  return toBase64(concatBytes([iv, ciphertextWithTag]));
}

export function open(sealed: string): Uint8Array {
  const blob = fromBase64(sealed);
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error(`sealed blob too short: ${blob.length}`);
  }

  const iv = blob.subarray(0, IV_BYTES);
  const ciphertextWithTag = blob.subarray(IV_BYTES);
  return gcm(config.masterKey, iv).decrypt(ciphertextWithTag);
}
