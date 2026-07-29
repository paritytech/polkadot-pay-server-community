// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import * as sr25519 from "micro-sr25519";

import { config } from "./src/env";
import { openDatabase } from "./src/db/client";
import { createSettlementChain } from "./src/modules/settlement/settlement.chain";
import { createSettlementQueue } from "./src/modules/settlement/settlement.queue";
import { createSettlementWorker } from "./src/modules/settlement/settlement.worker";

if (!config.operatorMnemonic) {
  throw new Error("settle-smoke requires OPERATOR_MNEMONIC to be set in the environment");
}

const chain = createSettlementChain({
  rpcUrl: config.peopleRpcUrl,
  mnemonic: config.operatorMnemonic,
  accountPath: config.settlement.accountPath,
});
console.log("destinationAddress:", chain.destinationAddress);

const db = await openDatabase();
const settlementQueue = createSettlementQueue({
  db,
  chain,
  redisUrl: config.redisUrl,
  maxAttempts: config.settlement.maxClaimAttempts,
});
settlementQueue.start();
const worker = createSettlementWorker(db, { queue: settlementQueue, intervalMs: 60_000 });
await worker.tick();
console.log("worker tick over empty unclaimed set: ok");

const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(config.operatorMnemonic)));
const fakeCoinSecret = sr25519.secretFromSeed(derive("//pps//coin//smoke-nonexistent").publicKey.slice(0, 32));
const present = await chain.coinPresent(fakeCoinSecret);
console.log("coinPresent(non-existent coin):", present, "(expected false)");

await settlementQueue.stop();
await chain.close();
await db.close();
console.log("smoke complete");