// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { hmacSha256Hex } from "../../lib/crypto";

export function signPayload(secret: Uint8Array, body: string, timestampSeconds: number): string {
  const signed = `${timestampSeconds}.${body}`;
  return `t=${timestampSeconds},v1=${hmacSha256Hex(secret, signed)}`;
}
