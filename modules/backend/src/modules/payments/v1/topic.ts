// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Wire constant shared with the Android payer app; renaming it breaks topic agreement.
const TOPIC_PREFIX = new TextEncoder().encode("pay-w3s:");

export function deriveTopic(id: string): Uint8Array {
  const idBytes = new TextEncoder().encode(id);
  const input = new Uint8Array(TOPIC_PREFIX.length + idBytes.length);
  input.set(TOPIC_PREFIX, 0);
  input.set(idBytes, TOPIC_PREFIX.length);
  const topic = blake2b(input, { dkLen: 32 });
  if (topic.length !== 32) {
    throw new Error(`derived topic must be 32 bytes (got ${topic.length})`);
  }
  return topic;
}

export function topicHex(id: string): string {
  return bytesToHex(deriveTopic(id));
}
