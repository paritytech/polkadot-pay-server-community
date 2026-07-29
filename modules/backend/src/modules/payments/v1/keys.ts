// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { p256 } from "@noble/curves/nist.js";

export interface PaymentKeypair {
  readonly privateKey: Uint8Array;
  readonly publicKeyCompressed: Uint8Array;
}

export function generatePaymentKeypair(): PaymentKeypair {
  const privateKey = p256.utils.randomSecretKey();
  const publicKeyCompressed = p256.getPublicKey(privateKey, true);
  return { privateKey, publicKeyCompressed };
}
