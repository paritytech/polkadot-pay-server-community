// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy, ss58Address } from "@polkadot-labs/hdkd-helpers";

export function deriveSettlementAddress(mnemonic: string, accountPath: string): string {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(mnemonic));
  const derive = sr25519CreateDerive(miniSecret);
  return ss58Address(derive(accountPath).publicKey);
}
