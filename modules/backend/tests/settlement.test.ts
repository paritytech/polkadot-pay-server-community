// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it, vi } from "bun:test";
import { DEV_PHRASE } from "@polkadot-labs/hdkd-helpers";

import { seal } from "../src/lib/crypto.ts";
import type { Database } from "../src/db/client.ts";
import { COIN_SECRET_BYTES } from "../src/modules/payments/v1/wire/codec.ts";
import {
  findPaymentByIdAnyMerchant,
  insertPayment,
  listUnclaimedPaymentsForSettlement,
  reclaimStalePaymentSettlements,
  updatePaymentCompletion,
} from "../src/modules/payments/payments.repo.ts";
import type { PaymentRecord } from "../src/modules/payments/payments.types.ts";
import type { CoinDisposition, CoinTransferResult, SettlementChain } from "../src/modules/settlement/settlement.chain.ts";
import { splitSealedCoins } from "../src/modules/settlement/settlement.coins.ts";
import { deriveSettlementAddress } from "../src/modules/settlement/settlement.mnemonic.ts";
import { createSettlementWorker } from "../src/modules/settlement/settlement.worker.ts";
import { claimPaymentById } from "../src/modules/settlement/settlement.claim.ts";
import type { SettlementQueue } from "../src/modules/settlement/settlement.queue.ts";
import { createTestDatabase, seedMerchantWithKey } from "./helpers/payment-fixture.ts";

const DESTINATION_ADDRESS = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

function makeCoinSecret(fill: number): Uint8Array {
  const bytes = new Uint8Array(COIN_SECRET_BYTES);
  for (let index = 0; index < COIN_SECRET_BYTES; index++) bytes[index] = (fill + index) & 0xff;
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

type TransferCoinHooks = {
  onSubmitted?: (txHash: string) => void | Promise<void>;
  onIncluded?: (txHash: string) => void | Promise<void>;
  onFinalized?: (txHash: string) => void | Promise<void>;
  onDropped?: (txHash: string, reason: string) => void | Promise<void>;
};
type Deferred = { promise: Promise<void>; resolve: () => void };

interface FakeChainOptions {
  failWith?: Error;
  failWithFor?: (coinSecret: Uint8Array) => Error | undefined;
  respond?: (coinSecret: Uint8Array) => CoinTransferResult;
  submittedHold?: Promise<void>;
  submittedHoldFor?: (coinSecret: Uint8Array) => Promise<void> | undefined;
  includedHold?: Promise<void>;
  includedHoldFor?: (coinSecret: Uint8Array) => Promise<void> | undefined;
  captureHooks?: (hooks: TransferCoinHooks, txHash: string) => void;
  dispositionFor?: (coinSecret: Uint8Array) => CoinDisposition;
}

class FakeSettlementChain implements SettlementChain {
  readonly destinationAddress = DESTINATION_ADDRESS;
  readonly received: Uint8Array[] = [];
  coinPresentCalls = 0;
  coinDispositionCalls = 0;
  callCount = 0;
  inFlight = 0;
  maxObservedConcurrency = 0;
  submittedCount = 0;
  includedCount = 0;
  private readonly submittedFiredDeferreds: Deferred[] = [];
  private readonly includedFiredDeferreds: Deferred[] = [];

  constructor(private readonly options: FakeChainOptions = {}) {}

  waitForSubmitted(callNumber: number): Promise<void> {
    let deferred = this.submittedFiredDeferreds[callNumber - 1];
    if (!deferred) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      deferred = { promise, resolve };
      this.submittedFiredDeferreds[callNumber - 1] = deferred;
    }
    return deferred.promise;
  }

  releaseSubmitted(callNumber: number): void {
    this.submittedFiredDeferreds[callNumber - 1]?.resolve();
  }

  waitForIncluded(callNumber: number): Promise<void> {
    let deferred = this.includedFiredDeferreds[callNumber - 1];
    if (!deferred) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      deferred = { promise, resolve };
      this.includedFiredDeferreds[callNumber - 1] = deferred;
    }
    return deferred.promise;
  }

  async transferCoin(
    coinSecret: Uint8Array,
    hooks?: TransferCoinHooks,
  ): Promise<CoinTransferResult> {
    const index = this.callCount;
    this.callCount += 1;
    this.received.push(coinSecret);
    this.inFlight += 1;
    this.maxObservedConcurrency = Math.max(this.maxObservedConcurrency, this.inFlight);
    const failure = this.options.failWithFor?.(coinSecret) ?? this.options.failWith;
    if (failure) {
      this.inFlight -= 1;
      throw failure;
    }
    const result: CoinTransferResult = this.options.respond
      ? this.options.respond(coinSecret)
      : {
          status: "transferred",
          txHash: "0x" + Array.from(coinSecret.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
        };
    if (result.txHash !== null) {
      if (hooks?.onSubmitted) await hooks.onSubmitted(result.txHash);
      this.submittedCount += 1;
      const submittedDeferred = this.submittedFiredDeferreds[index];
      if (submittedDeferred) submittedDeferred.resolve();
      const submittedHold = this.options.submittedHoldFor?.(coinSecret) ?? this.options.submittedHold;
      if (submittedHold) await submittedHold;
      await hooks?.onIncluded?.(result.txHash);
      this.includedCount += 1;
      if (hooks) this.options.captureHooks?.(hooks, result.txHash);
    }
    const includedDeferred = this.includedFiredDeferreds[index];
    if (includedDeferred) includedDeferred.resolve();
    const includedHold = this.options.includedHoldFor?.(coinSecret) ?? this.options.includedHold;
    if (includedHold) await includedHold;
    this.inFlight -= 1;
    return result;
  }

  coinAddress(coinSecret: Uint8Array): string {
    return `coin-${Buffer.from(coinSecret.subarray(0, 4)).toString("hex")}`;
  }

  async coinPresent(): Promise<boolean> {
    this.coinPresentCalls += 1;
    throw new Error("coinPresent must not be invoked by the claim path");
  }

  async coinDisposition(coinSecret: Uint8Array): Promise<CoinDisposition> {
    this.coinDispositionCalls += 1;
    return this.options.dispositionFor?.(coinSecret) ?? "source";
  }

  async close(): Promise<void> {}
}

function inlineQueue(
  db: Database,
  chain: SettlementChain,
  maxAttempts: number,
  notify?: (paymentId: string, type: string) => Promise<void>,
  leaseHeartbeatMs = 30_000,
): SettlementQueue {
  return {
    enqueue: (paymentId) =>
      claimPaymentById({ db, chain, maxAttempts, leaseHeartbeatMs, notify, coinDetectWindowMs: 100, coinDetectPollMs: 20 }, paymentId),
    start: () => {},
    stop: async () => {},
  };
}

async function insertCompletedPayment(
  db: Database,
  merchantId: string,
  coinsEnc: string,
  coinCount: number,
  paidAmount: string,
): Promise<PaymentRecord> {
  const now = Date.now();
  const id = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
  await insertPayment(db, {
    id,
    merchant_id: merchantId,
    status: "pending",
    amount: paidAmount,
    currency: "CASH",
    description: null,
    reference: null,
    metadata: "{}",
    display_name: null,
    idempotency_key: null,
    topic_hex: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join(""),
    deeplink: `polkadotapp://pay/cheque?id=${id}`,
    privkey_enc: null,
    pubkey_hex: "0x" + "22".repeat(32),
    created_at: now,
    expires_at: now + 900_000,
  });
  await updatePaymentCompletion(db, id, {
    status: "received",
    paid_amount: paidAmount,
    coin_count: coinCount,
    payer_timestamp_ms: now,
    coins_enc: coinsEnc,
    received_at: now,
    privkey_enc: null,
  });
  const record = await findPaymentByIdAnyMerchant(db, id);
  if (!record) throw new Error("inserted payment not found");
  return record;
}

describe("deriveSettlementAddress", () => {
  it("matches the well-known //Alice vector for DEV_PHRASE", () => {
    expect(deriveSettlementAddress(DEV_PHRASE, "//Alice")).toBe("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
  });

  it("matches the well-known bare-path vector for DEV_PHRASE", () => {
    expect(deriveSettlementAddress(DEV_PHRASE, "")).toBe("5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV");
  });
});

describe("splitSealedCoins", () => {
  it("round-trips a sealed blob of N concatenated 64-byte coins", () => {
    const coins = [makeCoinSecret(7), makeCoinSecret(11), makeCoinSecret(19)];
    const sealed = seal(concat(coins));
    const split = splitSealedCoins(sealed);
    expect(split.length).toBe(coins.length);
    for (let index = 0; index < coins.length; index++) {
      expect(Array.from(split[index])).toEqual(Array.from(coins[index]));
    }
  });

  it("splits a single coin correctly", () => {
    const coin = makeCoinSecret(3);
    const split = splitSealedCoins(seal(coin));
    expect(split.length).toBe(1);
    expect(Array.from(split[0])).toEqual(Array.from(coin));
  });

  it("throws when the sealed payload length is not a positive multiple of 64", () => {
    const bad = seal(new Uint8Array(63));
    expect(() => splitSealedCoins(bad)).toThrow();
  });

  it("throws when the sealed payload is empty (length 0)", () => {
    const bad = seal(new Uint8Array(0));
    expect(() => splitSealedCoins(bad)).toThrow();
  });

  it("throws when the sealed payload length is a positive multiple of 64 offset by 1", () => {
    const bad = seal(new Uint8Array(COIN_SECRET_BYTES * 2 + 1));
    expect(() => splitSealedCoins(bad)).toThrow();
  });
});

describe("SettlementWorker state machine", () => {
  it("transfers all coins and marks a completed payment as claimed with the last tx hash", async () => {
    const db = await createTestDatabase("settle_happy");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(7), makeCoinSecret(11)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "12.50");

    const chain = new FakeSettlementChain({
      respond: (coin) => ({
        status: "transferred",
        txHash: "0x" + Array.from(coin.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
      }),
    });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.claimed_at).not.toBeNull();
    expect(updated?.completed_at).not.toBeNull();
    expect(updated!.completed_at!).toBeGreaterThanOrEqual(updated!.claimed_at!);
    expect(updated?.claim_last_error).toBeNull();
    expect(updated?.settling_since).toBeNull();
    expect(chain.received.length).toBe(coins.length);
    for (let index = 0; index < coins.length; index++) {
      expect(Array.from(chain.received[index])).toEqual(Array.from(coins[index]));
    }
  });
  it("retries when coins have not yet arrived on chain and only fails after maxAttempts", async () => {
    const db = await createTestDatabase("settle_missing_coins");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(7), makeCoinSecret(11)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "12.50");

    const chain = new FakeSettlementChain({ dispositionFor: () => "missing" });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 2), leaseMs: 60_000 });

    await worker.tick();
    const afterFirst = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFirst?.status).toBe("settling");
    expect(afterFirst?.claim_attempts).toBe(1);
    expect(afterFirst?.claim_last_error).toContain("not yet on chain");
    expect(chain.received.length).toBe(0);

    await worker.tick();
    const afterSecond = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterSecond?.status).toBe("failed");
    expect(afterSecond?.claim_last_error).toContain("not yet on chain");
    expect(chain.received.length).toBe(0);
  });

  it("claims once coins arrive within the detection window", async () => {
    const db = await createTestDatabase("settle_late_coins");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(7)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "12.50");

    let probes = 0;
    const chain = new FakeSettlementChain({
      dispositionFor: () => {
        probes += 1;
        return probes >= 3 ? "source" : "missing";
      },
    });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 2), leaseMs: 60_000 });
    await worker.tick();

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.claim_attempts).toBe(0);
    expect(chain.received.length).toBe(1);
    expect(probes).toBeGreaterThanOrEqual(3);
  });

  it("credits a coin already held by its settlement purse and transfers only the rest", async () => {
    const db = await createTestDatabase("settle_purse_recovery");
    const { merchant } = await seedMerchantWithKey(db);
    const coinA = makeCoinSecret(7);
    const coinB = makeCoinSecret(11);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([coinA, coinB])), 2, "12.50");

    const chain = new FakeSettlementChain({
      dispositionFor: (coin) => (coin[0] === coinA[0] ? "purse" : "source"),
    });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(chain.received.length).toBe(1);
    expect(Array.from(chain.received[0])).toEqual(Array.from(coinB));
    expect(updated?.claim_included_coins[chain.coinAddress(coinA)]).toBe("reconciled:absent-on-chain");
  });

  it("emits payment.settling then payment.confirming then payment.settled across a successful claim", async () => {
    const db = await createTestDatabase("settle_events_ok");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(41)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const emitted: string[] = [];
    const chain = new FakeSettlementChain();
    const queue = inlineQueue(db, chain, 5, async (id, type) => {
      expect(id).toBe(payment.id);
      emitted.push(type);
    });
    await createSettlementWorker(db, { queue, leaseMs: 60_000 }).tick();

    expect(emitted).toEqual(["payment.settling", "payment.confirming", "payment.settled"]);
  });

  it("emits payment.failed once retries are exhausted and nothing on an intermediate retry", async () => {
    const db = await createTestDatabase("settle_events_fail");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(43)];
    await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const emitted: string[] = [];
    const chain = new FakeSettlementChain({ failWith: new Error("boom") });
    const queue = inlineQueue(db, chain, 2, async (_id, type) => {
      emitted.push(type);
    });
    const worker = createSettlementWorker(db, { queue, leaseMs: 60_000 });

    await worker.tick();
    expect(emitted).toEqual(["payment.settling"]);

    await worker.tick();
    expect(emitted).toEqual(["payment.settling", "payment.failed"]);
  });


  it("increments claim_attempts and records the error, then fails after maxAttempts", async () => {
    const db = await createTestDatabase("settle_retry");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(23)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");

    const chain = new FakeSettlementChain({ failWith: new Error("boom") });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 3), leaseMs: 60_000 });

    await worker.tick();
    const afterFirst = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFirst?.status).toBe("settling");
    expect(afterFirst?.completed_at).toBeNull();
    expect(afterFirst?.claim_attempts).toBe(1);
    expect(afterFirst?.claim_last_error).toBe("boom");
    expect(afterFirst?.settling_since).toBeNull();

    await worker.tick();
    const afterSecond = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterSecond?.status).toBe("settling");
    expect(afterSecond?.completed_at).toBeNull();
    expect(afterSecond?.claim_attempts).toBe(2);
    expect(afterSecond?.claim_last_error).toBe("boom");

    await worker.tick();
    const afterThird = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterThird?.status).toBe("failed");
    expect(afterThird?.completed_at).not.toBeNull();
    expect(afterThird?.claim_attempts).toBe(3);
    expect(afterThird?.claim_last_error).toBe("boom");
    expect(afterThird?.settling_since).toBeNull();
  });

  it("does not re-process a payment that is already claimed", async () => {
    const db = await createTestDatabase("settle_already_claimed");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(31)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");

    const chain = new FakeSettlementChain();
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    const claimed = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(claimed?.status).toBe("settled");
    const callsAfterClaim = chain.callCount;

    await worker.tick();
    expect(chain.callCount).toBe(callsAfterClaim);

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.claim_tx_hash).toBe(claimed?.claim_tx_hash);
  });

  it("does not process a payment while it is still leased (settling)", async () => {
    const db = await createTestDatabase("settle_in_lease");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(37)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");

    const now = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'settling', settling_since = $2 WHERE id = $1",
      [payment.id, now],
    );

    const chain = new FakeSettlementChain();
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    expect(chain.callCount).toBe(0);
    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settling");
  });

  it("leaves completed payments with null coins_enc untouched (never picked up)", async () => {
    const db = await createTestDatabase("settle_no_coins");
    const { merchant } = await seedMerchantWithKey(db);
    const now = Date.now();
    const id = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
    await insertPayment(db, {
      id,
      merchant_id: merchant.id,
      status: "pending",
      amount: "5.00",
      currency: "CASH",
      description: null,
      reference: null,
      metadata: "{}",
      display_name: null,
      idempotency_key: null,
    topic_hex: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join(""),
      deeplink: `polkadotapp://pay/cheque?id=${id}`,
      privkey_enc: null,
      pubkey_hex: "0x" + "44".repeat(32),
      created_at: now,
      expires_at: now + 900_000,
    });
    await updatePaymentCompletion(db, id, {
      status: "received",
      paid_amount: "5.00",
      coin_count: 0,
      payer_timestamp_ms: now,
      coins_enc: "0xplaceholder",
      received_at: now,
      privkey_enc: null,
    });
    await db.execute("UPDATE payments SET coins_enc = NULL WHERE id = $1", [id]);

    const chain = new FakeSettlementChain();
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    expect(chain.callCount).toBe(0);
    const updated = await findPaymentByIdAnyMerchant(db, id);
    expect(updated?.status).toBe("received");
  });

  it("reclaims a stale settling row to unclaimed and then settles it on the next tick", async () => {
    const db = await createTestDatabase("settle_stale_reclaim");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(41), makeCoinSecret(43)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");

    const leaseStartedAt = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'settling', settling_since = $2 WHERE id = $1",
      [payment.id, leaseStartedAt - 600_000],
    );

    const chain = new FakeSettlementChain();
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.claimed_at).not.toBeNull();
    expect(chain.received.length).toBe(coins.length);
    for (let index = 0; index < coins.length; index++) {
      expect(Array.from(chain.received[index])).toEqual(Array.from(coins[index]));
    }
  });

  it("settles only unclaimed rows when multiple payments exist", async () => {
    const db = await createTestDatabase("settle_mixed");
    const { merchant } = await seedMerchantWithKey(db);
    const coinA = [makeCoinSecret(47)];
    const coinB = [makeCoinSecret(53)];
    const coinC = [makeCoinSecret(59)];
    const paymentA = await insertCompletedPayment(db, merchant.id, seal(concat(coinA)), 1, "1.00");
    const paymentB = await insertCompletedPayment(db, merchant.id, seal(concat(coinB)), 1, "2.00");
    const paymentC = await insertCompletedPayment(db, merchant.id, seal(concat(coinC)), 1, "3.00");

    await db.execute(
      "UPDATE payments SET status = 'settled', claim_tx_hash = '0xbefore', claimed_at = $2 WHERE id = $1",
      [paymentB.id, Date.now()],
    );

    const chain = new FakeSettlementChain();
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    await worker.tick();

    expect(chain.callCount).toBe(2);

    const a = await findPaymentByIdAnyMerchant(db, paymentA.id);
    const b = await findPaymentByIdAnyMerchant(db, paymentB.id);
    const c = await findPaymentByIdAnyMerchant(db, paymentC.id);
    expect(a?.status).toBe("settled");
    expect(a?.claim_tx_hash).not.toBeNull();
    expect(b?.status).toBe("settled");
    expect(b?.claim_tx_hash).toBe("0xbefore");
    expect(c?.status).toBe("settled");
    expect(c?.claim_tx_hash).not.toBeNull();
  });

  it("passes the row through 'confirming' with claim_tx_hash before finalization, then ends at 'settled'", async () => {
    const db = await createTestDatabase("settle_confirming");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(73)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "7.00");

    const { promise: includedRelease, resolve: releaseIncluded } = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ includedHold: includedRelease });

    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    const settled = worker.tick();

    await chain.waitForIncluded(1);
    const midState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(midState?.status).toBe("confirming");
    expect(midState?.claim_tx_hash).not.toBeNull();
    expect(midState?.claim_tx_hash).toBe(
      "0x" + Array.from(coins[0].slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(midState?.settling_since).not.toBeNull();
    expect(midState?.claimed_at).not.toBeNull();

    releaseIncluded();
    await settled;

    const finalState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(finalState?.status).toBe("settled");
    expect(finalState?.claimed_at).not.toBeNull();
    expect(finalState?.claimed_at).toBe(midState?.claimed_at);
    expect(finalState?.settling_since).toBeNull();
  });

  it("heartbeats the settlement lease at each coin's inclusion so a slow claim is never reclaimed", async () => {
    const db = await createTestDatabase("settle_lease_heartbeat");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(83)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const { promise: includedRelease, resolve: releaseIncluded } = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ includedHold: includedRelease });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });

    const leasedAt = Date.now();
    const settled = worker.tick();
    await chain.waitForIncluded(1);

    const heartbeat = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(heartbeat?.status).toBe("confirming");
    expect(heartbeat?.settling_since).not.toBeNull();
    expect(heartbeat!.settling_since!).toBeGreaterThanOrEqual(leasedAt);

    releaseIncluded();
    await settled;
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
  });

  it("reclaims a stale 'confirming' row only back to 'settling'", async () => {
    const db = await createTestDatabase("settle_stale_confirming");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(79)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");

    const leaseStartedAt = Date.now();
    await db.execute(
      "UPDATE payments SET status = 'confirming', claim_tx_hash = '0xstuck', settling_since = $2 WHERE id = $1",
      [payment.id, leaseStartedAt - 600_000],
    );

    const reclaimedCount = await reclaimStalePaymentSettlements(db, Date.now() - 60_000);
    expect(reclaimedCount).toBe(1);

    const reclaimed = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(reclaimed?.status).toBe("settling");
    expect(reclaimed?.claim_tx_hash).toBe("0xstuck");
    expect(reclaimed?.settling_since).toBeNull();
  });

  it("settles on inclusion alone, without waiting for the transfer to finalize", async () => {
    const db = await createTestDatabase("settle_on_inclusion");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(89)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "11.00");

    const captured: TransferCoinHooks[] = [];
    const chain = new FakeSettlementChain({ captureHooks: (hooks) => captured.push(hooks) });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });

    await worker.tick();

    const settledState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(settledState?.status).toBe("settled");
    expect(settledState?.claimed_at).not.toBeNull();

    await captured[0]?.onFinalized?.("0xlate");
    const afterFinality = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFinality?.status).toBe("settled");
    expect(afterFinality?.claimed_at).toBe(settledState!.claimed_at);
  });

  it("reopens a settled payment whose included transfer was later dropped", async () => {
    const db = await createTestDatabase("settle_dropped_after_inclusion");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(97)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "13.00");

    const captured: TransferCoinHooks[] = [];
    const events: string[] = [];
    const chain = new FakeSettlementChain({ captureHooks: (hooks) => captured.push(hooks) });
    const worker = createSettlementWorker(db, {
      queue: inlineQueue(db, chain, 5, async (_id, type) => {
        events.push(type);
      }),
      leaseMs: 60_000,
    });

    await worker.tick();
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");

    await captured[0]?.onDropped?.(Object.values((await findPaymentByIdAnyMerchant(db, payment.id))!.claim_included_coins)[0], "reorged out");

    const reopened = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(reopened?.status).toBe("settling");
    expect(reopened?.claimed_at).toBeNull();
    expect(reopened?.settling_since).toBeNull();
    expect(reopened?.claim_attempts).toBe(1);
    expect(reopened?.claim_last_error).toBe("reorged out");
    expect(events).toContain("payment.settling");

    await worker.tick();
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
  });

  it("heartbeats the lease on a timer so a long-running claim is never reclaimed", async () => {
    const db = await createTestDatabase("settle_lease_heartbeat_interval");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(101)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const leaseTouches: number[] = [];
    const countingDb: Database = {
      ...db,
      execute: (statement, params) => {
        if (statement.includes("UPDATE payments SET settling_since = $2")) {
          leaseTouches.push(Date.now());
        }
        return db.execute(statement, params);
      },
    };

    // Real-time interval: bun 1.3 fake timers hang the post-`transferGate.resolve()` continuation when a real DB driver is in play.
    const transferGate = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ includedHold: transferGate.promise });
    const queue = inlineQueue(countingDb, chain, 5, undefined, 15);
    const worker = createSettlementWorker(db, { queue, leaseMs: 60_000 });

    const settled = worker.tick();
    await chain.waitForIncluded(1);
    const baseline = leaseTouches.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(leaseTouches.length).toBeGreaterThan(baseline + 1);

    transferGate.resolve();
    await settled;
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
  });

  it("clears the lease heartbeat when a coin transfer throws", async () => {
    const db = await createTestDatabase("settle_lease_heartbeat_throw");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(103)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const leaseTouches: number[] = [];
    const countingDb: Database = {
      ...db,
      execute: (statement, params) => {
        if (statement.includes("UPDATE payments SET settling_since = $2")) {
          leaseTouches.push(Date.now());
        }
        return db.execute(statement, params);
      },
    };

    vi.useFakeTimers();
    try {
      const chain = new FakeSettlementChain({ failWith: new Error("boom") });
      const queue = inlineQueue(countingDb, chain, 5, undefined, 10);
      const worker = createSettlementWorker(db, { queue, leaseMs: 60_000 });

      await worker.tick();
      const touchesAfterTick = leaseTouches.length;
      vi.advanceTimersByTime(50);
      expect(leaseTouches.length).toBe(touchesAfterTick);

      const row = await findPaymentByIdAnyMerchant(db, payment.id);
      expect(row?.status).toBe("settling");
      expect(row?.claim_last_error).toBe("boom");
    } finally {
      vi.useRealTimers();
    }
  });

  it("records the first submitted claim hash while status remains settling, then transitions to confirming on inclusion", async () => {
    const db = await createTestDatabase("settle_submitted_hash");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(7)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "9.00");

    const { promise: submittedHold, resolve: releaseSubmitted } = Promise.withResolvers<void>();
    const { promise: includedHold, resolve: releaseIncluded } = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ submittedHold, includedHold });

    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    const settled = worker.tick();

    await chain.waitForSubmitted(1);
    const submittedState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(submittedState?.status).toBe("settling");
    expect(submittedState?.claim_tx_hash).toBe(
      "0x" + Array.from(coins[0].slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(submittedState?.claimed_at).toBeNull();

    releaseSubmitted();
    await chain.waitForIncluded(1);
    const confirmingState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(confirmingState?.status).toBe("confirming");
    expect(confirmingState?.claim_tx_hash).toBe(submittedState?.claim_tx_hash);

    releaseIncluded();
    await settled;

    const finalState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(finalState?.status).toBe("settled");
    expect(finalState?.claim_tx_hash).toBe(submittedState?.claim_tx_hash);
  });

  it("starts every distinct multi-coin transfer concurrently before any inclusion is released", async () => {
    const db = await createTestDatabase("settle_concurrent_transfers");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(7), makeCoinSecret(11), makeCoinSecret(19)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "12.50");

    const { promise: includedHold, resolve: releaseIncluded } = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ includedHold });

    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });
    const settled = worker.tick();

    await Promise.all([chain.waitForSubmitted(1), chain.waitForSubmitted(2), chain.waitForSubmitted(3)]);
    expect(chain.callCount).toBe(3);
    expect(chain.submittedCount).toBe(3);
    expect(chain.maxObservedConcurrency).toBe(3);

    releaseIncluded();
    await settled;

    const finalState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(finalState?.status).toBe("settled");
    const expectedHashes = coins.map(
      (coin) => "0x" + Array.from(coin.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
    );
    expect(expectedHashes).toContain(finalState!.claim_tx_hash!);
  });

  it("emits payment.confirming exactly once across concurrent inclusions of multiple coins", async () => {
    const db = await createTestDatabase("settle_single_confirming");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(23), makeCoinSecret(29)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "10.00");
    const emitted: string[] = [];
    const chain = new FakeSettlementChain();
    const queue = inlineQueue(db, chain, 5, async (_id, type) => {
      emitted.push(type);
    });
    await createSettlementWorker(db, { queue, leaseMs: 60_000 }).tick();

    expect(emitted.filter((t) => t === "payment.confirming").length).toBe(1);
    expect(emitted).toEqual(["payment.settling", "payment.confirming", "payment.settled"]);

    const finalState = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(finalState?.status).toBe("settled");
    expect(finalState?.claim_tx_hash).not.toBeNull();
  });

  it("stays settling until every coin is included, then confirms exactly once", async () => {
    const db = await createTestDatabase("settle_aggregate_confirmation");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(31), makeCoinSecret(37), makeCoinSecret(41)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "10.00");
    const finalCoinGate = Promise.withResolvers<void>();
    const emitted: string[] = [];
    const chain = new FakeSettlementChain({
      submittedHoldFor: (coin) => (coin[0] === coins[2][0] ? finalCoinGate.promise : undefined),
    });
    const worker = createSettlementWorker(db, {
      queue: inlineQueue(db, chain, 5, async (_id, type) => {
        emitted.push(type);
      }),
      leaseMs: 60_000,
    });
    const attempt = worker.tick();

    await Promise.all([chain.waitForIncluded(1), chain.waitForIncluded(2), chain.waitForSubmitted(3)]);
    const partial = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(partial?.status).toBe("settling");
    expect(Object.keys(partial?.claim_included_coins ?? {})).toHaveLength(2);
    expect(emitted.filter((type) => type === "payment.confirming")).toHaveLength(0);

    finalCoinGate.resolve();
    await attempt;
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
    expect(emitted.filter((type) => type === "payment.confirming")).toHaveLength(1);
    expect(emitted).toEqual(["payment.settling", "payment.confirming", "payment.settled"]);
  });

  it("retries only the unrecorded coin on the next attempt when one transfer rejects and its sibling succeeds", async () => {
    const db = await createTestDatabase("settle_partial_transfer_recovery");
    const { merchant } = await seedMerchantWithKey(db);
    const coinA = makeCoinSecret(39);
    const coinB = makeCoinSecret(43);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([coinA, coinB])), 2, "10.00");
    const statusHistory: PaymentRecord["status"][] = [payment.status];
    const firstA = Promise.withResolvers<void>();
    let failB = true;
    const chain = new FakeSettlementChain({
      failWithFor: (coin) => {
        if (coin[0] === coinB[0] && failB) {
          failB = false;
          return new Error("coin B unavailable");
        }
        return undefined;
      },
      includedHoldFor: (coin) => (coin[0] === coinA[0] ? firstA.promise : undefined),
    });
    const worker = createSettlementWorker(db, {
      queue: inlineQueue(db, chain, 5, async () => {
        const current = await findPaymentByIdAnyMerchant(db, payment.id);
        if (current) statusHistory.push(current.status);
      }),
      leaseMs: 60_000,
    });

    let firstAttemptReleased = false;
    const firstAttempt = worker.tick().then(() => {
      firstAttemptReleased = true;
    });
    await chain.waitForIncluded(1);
    await Promise.resolve();
    expect(chain.callCount).toBe(2);
    expect(firstAttemptReleased).toBe(false);

    firstA.resolve();
    await firstAttempt;
    const afterFirst = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFirst?.status).toBe("settling");
    expect(afterFirst?.claim_included_coins).toEqual({ [`coin-${Buffer.from(coinA.subarray(0, 4)).toString("hex")}`]: "0x" + Array.from(coinA.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("") });
    expect(chain.coinPresentCalls).toBe(0);
    expect(afterFirst?.claim_attempts).toBe(1);
    expect(afterFirst?.claim_last_error).toBe("coin B unavailable");
    expect((await listUnclaimedPaymentsForSettlement(db, 10)).map(({ id }) => id)).toContain(payment.id);
    statusHistory.push(afterFirst!.status);

    await worker.tick();
    expect(chain.callCount).toBe(3);
    expect(chain.received).toEqual([coinA, coinB, coinB]);
    expect(chain.coinPresentCalls).toBe(0);
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
    const addressA = `coin-${Buffer.from(coinA.subarray(0, 4)).toString("hex")}`;
    const addressB = `coin-${Buffer.from(coinB.subarray(0, 4)).toString("hex")}`;
    const hashB = "0x" + Array.from(coinB.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.claim_included_coins).toEqual({
      [addressA]: "0x" + Array.from(coinA.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
      [addressB]: hashB,
    });
    const rank: Partial<Record<PaymentRecord["status"], number>> = {
      pending: 0,
      received: 1,
      settling: 2,
      confirming: 3,
      settled: 4,
    };
    expect(statusHistory).toEqual(["received", "settling", "settling", "confirming", "settled"]);
    expect(statusHistory.every((status, index) => index === 0 || rank[status]! >= rank[statusHistory[index - 1]]!)).toBe(true);
  });

  it("reopens a confirming aggregate when one included coin drops while its sibling is pending", async () => {
    const db = await createTestDatabase("settle_drop_during_aggregate_confirmation");
    const { merchant } = await seedMerchantWithKey(db);
    const coinA = makeCoinSecret(53);
    const coinB = makeCoinSecret(59);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([coinA, coinB])), 2, "10.00");
    const releaseB = Promise.withResolvers<void>();
    const hooksByHash = new Map<string, TransferCoinHooks>();
    const emitted: string[] = [];
    const chain = new FakeSettlementChain({
      includedHoldFor: (coin) => (coin[0] === coinB[0] ? releaseB.promise : undefined),
      captureHooks: (hooks, hash) => hooksByHash.set(hash, hooks),
    });
    const worker = createSettlementWorker(db, {
      queue: inlineQueue(db, chain, 5, async (_id, type) => {
        emitted.push(type);
      }),
      leaseMs: 60_000,
    });
    const attempt = worker.tick();
    await Promise.all([chain.waitForIncluded(1), chain.waitForIncluded(2)]);
    const coinAHash = "0x" + Array.from(coinA.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("confirming");

    await hooksByHash.get(coinAHash)?.onDropped?.(coinAHash, "coin A reorged out");
    releaseB.resolve();
    await attempt;

    const reopened = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(reopened?.status).toBe("settling");
    expect(reopened?.claimed_at).toBeNull();
    expect(reopened?.claim_last_error).toBe("coin A reorged out");
    expect(emitted).not.toContain("payment.settled");
  });

  it("makes zero coinPresent calls on a fresh claim and after every retry", async () => {
    const db = await createTestDatabase("settle_fresh_zero_coin_present");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(41), makeCoinSecret(47)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "5.00");
    const { promise: includedHold, resolve: releaseIncluded } = Promise.withResolvers<void>();
    const chain = new FakeSettlementChain({ includedHold });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 3), leaseMs: 60_000 });

    const attempt = worker.tick();
    await Promise.all([chain.waitForSubmitted(1), chain.waitForSubmitted(2)]);
    expect(chain.coinPresentCalls).toBe(0);
    expect(chain.received).toEqual(coins);

    releaseIncluded();
    await attempt;
    expect((await findPaymentByIdAnyMerchant(db, payment.id))?.status).toBe("settled");
    expect(chain.coinPresentCalls).toBe(0);
  });

  it("does not skip a coin on a retry merely because a previous attempt persisted a claim_tx_hash without recording inclusion", async () => {
    const db = await createTestDatabase("settle_signed_hash_no_inclusion");
    const { merchant } = await seedMerchantWithKey(db);
    const coinA = makeCoinSecret(53);
    const coinB = makeCoinSecret(59);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([coinA, coinB])), 2, "11.00");
    const { promise: submittedHold, resolve: releaseSubmitted } = Promise.withResolvers<void>();
    let failB = true;
    const chain = new FakeSettlementChain({
      submittedHold,
      failWithFor: (coin) => {
        if (coin[0] === coinB[0] && failB) {
          failB = false;
          return new Error("coin B unavailable");
        }
        return undefined;
      },
    });
    const worker = createSettlementWorker(db, { queue: inlineQueue(db, chain, 5), leaseMs: 60_000 });

    const firstAttempt = worker.tick();
    await chain.waitForSubmitted(1);
    releaseSubmitted();
    await firstAttempt;

    const afterFirst = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFirst?.status).toBe("settling");
    expect(afterFirst?.claim_tx_hash).not.toBeNull();
    expect(Object.keys(afterFirst?.claim_included_coins ?? {})).toHaveLength(1);
    expect(chain.coinPresentCalls).toBe(0);

    await worker.tick();
    expect(chain.callCount).toBe(3);
    expect(chain.received).toEqual([coinA, coinB, coinB]);
    expect(chain.coinPresentCalls).toBe(0);
    const settled = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(settled?.status).toBe("settled");
    const addressA = `coin-${Buffer.from(coinA.subarray(0, 4)).toString("hex")}`;
    const addressB = `coin-${Buffer.from(coinB.subarray(0, 4)).toString("hex")}`;
    expect(settled?.claim_included_coins).toEqual({
      [addressA]: "0x" + Array.from(coinA.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
      [addressB]: "0x" + Array.from(coinB.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join(""),
    });
  });
});
