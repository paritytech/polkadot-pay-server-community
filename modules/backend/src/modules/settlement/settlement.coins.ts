// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { open } from "../../lib/crypto";
import { COIN_SECRET_BYTES } from "../../modules/payments/v1/wire/codec";

export function splitSealedCoins(coinsEnc: string): Uint8Array[] {
  const flat = open(coinsEnc);
  if (flat.length === 0 || flat.length % COIN_SECRET_BYTES !== 0) {
    throw new Error(`coin blob length ${flat.length} is not a multiple of ${COIN_SECRET_BYTES}`);
  }
  const coins: Uint8Array[] = [];
  for (let offset = 0; offset < flat.length; offset += COIN_SECRET_BYTES) {
    coins.push(flat.subarray(offset, offset + COIN_SECRET_BYTES));
  }
  return coins;
}
