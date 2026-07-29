// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { Queue, QueueEvents, Worker } from "bullmq";

import { seal } from "../src/lib/crypto.ts";
import type { Database } from "../src/db/client.ts";
import {
  findPaymentByIdAnyMerchant,
  insertPayment,
  updatePaymentCompletion,
} from "../src/modules/payments/payments.repo.ts";
import type { PaymentRecord } from "../src/modules/payments/payments.types.ts";
import { SETTLEMENT_QUEUE_NAME, createSettlementQueue } from "../src/modules/settlement/settlement.queue.ts";
import type { CoinTransferResult, SettlementChain } from "../src/modules/settlement/settlement.chain.ts";
import type { SettlementQueue } from "../src/modules/settlement/settlement.queue.ts";
import { createSettlementWorker } from "../src/modules/settlement/settlement.worker.ts";
import { createTestDatabase, seedMerchantWithKey } from "./helpers/payment-fixture.ts";

const DESTINATION_ADDRESS = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const REDIS_URL = Bun.env.REDIS_URL ?? "redis://redis:6379";
const QUEUE_PREFIX = `test-${crypto.randomUUID().replaceAll("-", "")}`;

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

function makeCoinSecret(fill: number): Uint8Array {
  const bytes = new Uint8Array(64);
  for (let index = 0; index < bytes.length; index++) bytes[index] = (fill + index) & 0xff;
  return bytes;
}

function txHashFor(coin: Uint8Array): string {
  return "0x" + Array.from(coin.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Deferred = {
  promise: Promise<void>;
  resolve: (value?: void | PromiseLike<void>) => void;
};

async function turn(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  await promise;
}

function readDeferred(list: Array<Deferred | undefined>, index: number): Deferred {
  const existing = list[index];
  if (existing) return existing;
  const { promise, resolve } = Promise.withResolvers<void>();
  const deferred = { promise, resolve };
  list[index] = deferred;
  return deferred;
}

function waitForQueueCompletion(queueEvents: QueueEvents, jobId: string): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  const handler = ({ jobId: completedJobId }: { jobId: string }) => {
    if (completedJobId === jobId) {
      queueEvents.off("completed", handler);
      resolve();
    }
  };
  queueEvents.on("completed", handler);
  return promise;
}

type TransferCoinHooks = {
  onSubmitted?: (txHash: string) => void | Promise<void>;
  onIncluded?: (txHash: string) => void | Promise<void>;
};

interface FakeChainOptions {
  holdCalls?: boolean;
  respond?: (coin: Uint8Array) => CoinTransferResult;
  failWith?: Error;
}

class FakeSettlementChain implements SettlementChain {
  readonly destinationAddress = DESTINATION_ADDRESS;
  readonly received: Uint8Array[] = [];
  callCount = 0;
  inFlight = 0;
  maxObservedConcurrency = 0;
  submittedCount = 0;

  private readonly started: Array<Deferred | undefined> = [];
  private readonly submitted: Array<Deferred | undefined> = [];
  private readonly finished: Array<Deferred | undefined> = [];
  private readonly releases: Array<Deferred | undefined> = [];

  constructor(private readonly options: FakeChainOptions = {}) {}

  async transferCoin(
    coinSecret: Uint8Array,
    hooks?: TransferCoinHooks,
  ): Promise<CoinTransferResult> {
    const index = this.callCount;
    this.callCount += 1;
    this.received.push(coinSecret);
    this.inFlight += 1;
    this.maxObservedConcurrency = Math.max(this.maxObservedConcurrency, this.inFlight);
    readDeferred(this.started, index).resolve();
    try {
      if (this.options.holdCalls) await readDeferred(this.releases, index).promise;
      if (this.options.failWith) throw this.options.failWith;
      const result: CoinTransferResult = this.options.respond
        ? this.options.respond(coinSecret)
        : { status: "transferred", txHash: txHashFor(coinSecret) };
      if (result.txHash !== null) {
        if (hooks?.onSubmitted) await hooks.onSubmitted(result.txHash);
        this.submittedCount += 1;
        readDeferred(this.submitted, index).resolve();
        await hooks?.onIncluded?.(result.txHash);
      }
      return result;
    } finally {
      this.inFlight -= 1;
      readDeferred(this.finished, index).resolve();
    }
  }

  coinAddress(coinSecret: Uint8Array): string {
    return `coin-${Buffer.from(coinSecret.subarray(0, 4)).toString("hex")}`;
  }

  async coinPresent(): Promise<boolean> {
    return true;
  }

  async coinDisposition(): Promise<"source"> {
    return "source";
  }

  waitForCall(callNumber: number): Promise<void> {
    return readDeferred(this.started, callNumber - 1).promise;
  }

  waitForSubmitted(callNumber: number): Promise<void> {
    return readDeferred(this.submitted, callNumber - 1).promise;
  }

  releaseCall(callNumber: number): void {
    readDeferred(this.releases, callNumber - 1).resolve();
  }

  async close(): Promise<void> {}
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

type TrackedQueue = {
  queue: SettlementQueue;
  events: QueueEvents;
  redisUrl: string;
};

const trackedQueues: TrackedQueue[] = [];

// Teardown watchdog: BullMQ's close can block inside a live ioredis socket, which fake timers cannot drive.
async function withDeadline(work: Promise<unknown>): Promise<void> {
  const timeout = Promise.withResolvers<void>();
  const timer = setTimeout(() => timeout.resolve(), 2000);
  try {
    await Promise.race([work.catch(() => {}), timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

// Real-clock polling: observing Redis-side job state requires I/O round-trips that fake timers cannot advance.
async function pollUntil(description: string, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    const tick = Promise.withResolvers<void>();
    const timer = setTimeout(() => tick.resolve(), 25);
    await tick.promise;
    clearTimeout(timer);
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function cleanupQueues(): Promise<void> {
  for (const { queue, events, redisUrl } of trackedQueues.splice(0)) {
    await withDeadline(events.close());
    await withDeadline(queue.stop());
    const rawQueue = new Queue(SETTLEMENT_QUEUE_NAME, { connection: { url: redisUrl }, prefix: QUEUE_PREFIX });
    await withDeadline(rawQueue.obliterate({ force: true }));
    await withDeadline(rawQueue.close());
  }
}

afterEach(cleanupQueues);
afterAll(cleanupQueues);

describe("Settlement queue", () => {
  it("processes payments in parallel so a stalled transfer does not block the queue", async () => {
    const db = await createTestDatabase("settle_queue_parallel");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = await Promise.all(
      [7, 11, 13, 17].map(async (fill, index) => {
        const coin = makeCoinSecret(fill + index);
        return insertCompletedPayment(db, merchant.id, seal(concat([coin])), 1, `${index + 1}.00`);
      }),
    );

    const chain = new FakeSettlementChain({ holdCalls: true });
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();
    const producer = createSettlementWorker(db, { queue, leaseMs: 60_000 });
    const completions = payments.map((payment) => waitForQueueCompletion(events, payment.id));

    const inspector = new Queue(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    try {
      await producer.tick();
      const targetActive = Math.min(payments.length, 4);
      await pollUntil(`${targetActive} payments held active in parallel`, async () => {
        const counts = await inspector.getJobCounts("active", "waiting", "delayed", "prioritized");
        return counts.active === targetActive;
      });
      await pollUntil("chain observes parallel transfers", async () => chain.callCount >= targetActive);
      expect(chain.maxObservedConcurrency).toBeGreaterThan(1);
      for (let call = 1; call <= payments.length; call += 1) chain.releaseCall(call);
      await Promise.all(completions);
    } finally {
      await withDeadline(inspector.close());
    }

    const states = await Promise.all(payments.map((payment) => findPaymentByIdAnyMerchant(db, payment.id)));
    expect(states.every((payment) => payment?.status === "settled")).toBe(true);
  });

  it("honors an explicit concurrency: 1 to serialize payments", async () => {
    const db = await createTestDatabase("settle_queue_serial_one");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = await Promise.all(
      [19, 23, 29].map(async (fill, index) => {
        const coin = makeCoinSecret(fill + index);
        return insertCompletedPayment(db, merchant.id, seal(concat([coin])), 1, `${index + 1}.00`);
      }),
    );

    const chain = new FakeSettlementChain({ holdCalls: true });
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX, concurrency: 1 });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();
    const producer = createSettlementWorker(db, { queue, leaseMs: 60_000 });
    const completions = payments.map((payment) => waitForQueueCompletion(events, payment.id));

    const inspector = new Queue(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    try {
      await producer.tick();
      for (let call = 1; call <= payments.length; call += 1) {
        await chain.waitForCall(call);
        const stillQueued = payments.length - call;
        await pollUntil(`${stillQueued} job(s) held in waiting while one is active`, async () => {
          const counts = await inspector.getJobCounts("active", "waiting", "delayed", "prioritized");
          return counts.active === 1 && counts.waiting + counts.delayed + counts.prioritized === stillQueued;
        });
        expect(chain.callCount).toBe(call);
        expect(chain.maxObservedConcurrency).toBe(1);
        chain.releaseCall(call);
      }
      await Promise.all(completions);
    } finally {
      await withDeadline(inspector.close());
    }
  });

  it("deduplicates a payment queued twice while the first job is still pending", async () => {
    const db = await createTestDatabase("settle_queue_dedupe");
    const { merchant } = await seedMerchantWithKey(db);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([makeCoinSecret(23)])), 1, "4.00");

    const chain = new FakeSettlementChain({ holdCalls: true });
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();

    const completion = waitForQueueCompletion(events, payment.id);
    const firstEnqueue = queue.enqueue(payment.id);
    await chain.waitForCall(1);
    await queue.enqueue(payment.id);
    chain.releaseCall(1);
    await completion;
    await firstEnqueue;

    expect(chain.callCount).toBe(1);
  });

  it("marks a completed payment as claimed with the last transferred coin hash", async () => {
    const db = await createTestDatabase("settle_queue_happy");
    const { merchant } = await seedMerchantWithKey(db);
    const coins = [makeCoinSecret(31), makeCoinSecret(37)];
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat(coins)), coins.length, "12.50");

    const chain = new FakeSettlementChain();
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();
    const producer = createSettlementWorker(db, { queue, leaseMs: 60_000 });
    const completion = waitForQueueCompletion(events, payment.id);

    await producer.tick();
    await completion;

    const updated = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(updated?.status).toBe("settled");
    expect(updated?.claim_last_error).toBeNull();
  });

  it("keeps a failed transfer retryable until maxAttempts is exhausted", async () => {
    const db = await createTestDatabase("settle_queue_fail");
    const { merchant } = await seedMerchantWithKey(db);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([makeCoinSecret(43)])), 1, "5.00");

    const chain = new FakeSettlementChain({ failWith: new Error("boom") });
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, maxAttempts: 2, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();
    const producer = createSettlementWorker(db, { queue, leaseMs: 60_000 });

    const firstCompletion = waitForQueueCompletion(events, payment.id);
    await producer.tick();
    await firstCompletion;

    const afterFirst = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterFirst?.status).toBe("settling");
    expect(afterFirst?.claim_attempts).toBe(1);
    expect(afterFirst?.claim_last_error).toBe("boom");
    expect(afterFirst?.claim_tx_hash).toBeNull();

    const secondCompletion = waitForQueueCompletion(events, payment.id);
    await producer.tick();
    await secondCompletion;

    const afterSecond = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(afterSecond?.status).toBe("failed");
    expect(afterSecond?.claim_attempts).toBe(2);
    expect(afterSecond?.claim_last_error).toBe("boom");
    expect(afterSecond?.claim_tx_hash).toBeNull();
  });

  it("start() performs an immediate tick without waiting for the full interval", async () => {
    const db = await createTestDatabase("settle_queue_immediate");
    const { merchant } = await seedMerchantWithKey(db);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([makeCoinSecret(67)])), 1, "6.00");

    const chain = new FakeSettlementChain({ holdCalls: true });
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();

    const worker = createSettlementWorker(db, { queue, intervalMs: 20_000, leaseMs: 60_000 });
    worker.start();

    await chain.waitForCall(1);
    const enqueued = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(enqueued?.status).toBe("settling");
    expect(enqueued?.settling_since).not.toBeNull();
    expect(chain.callCount).toBe(1);

    const completion = waitForQueueCompletion(events, payment.id);
    chain.releaseCall(1);
    await completion;

    const settled = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(settled?.status).toBe("settled");

    worker.stop();
  });

  it("re-enqueues a payment whose previous job is retained in a terminal failed state", async () => {
    const db = await createTestDatabase("settle_queue_terminal");
    const { merchant } = await seedMerchantWithKey(db);
    const payment = await insertCompletedPayment(db, merchant.id, seal(concat([makeCoinSecret(71)])), 1, "7.00");

    const inspector = new Queue(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    const stallingWorker = new Worker(
      SETTLEMENT_QUEUE_NAME,
      async () => { throw new Error("job stalled more than allowable limit"); },
      { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX, concurrency: 1 },
    );
    const failed = Promise.withResolvers<void>();
    stallingWorker.on("failed", () => failed.resolve());
    await inspector.add(SETTLEMENT_QUEUE_NAME, { paymentId: payment.id }, { jobId: payment.id, attempts: 1, removeOnFail: false });
    await failed.promise;
    await withDeadline(stallingWorker.close());
    expect(await (await inspector.getJob(payment.id))?.getState()).toBe("failed");

    const chain = new FakeSettlementChain();
    const queue = createSettlementQueue({ db, chain, redisUrl: REDIS_URL, prefix: QUEUE_PREFIX });
    const events = new QueueEvents(SETTLEMENT_QUEUE_NAME, { connection: { url: REDIS_URL }, prefix: QUEUE_PREFIX });
    await events.waitUntilReady();
    trackedQueues.push({ queue, events, redisUrl: REDIS_URL });
    queue.start();

    try {
      const completion = waitForQueueCompletion(events, payment.id);
      await queue.enqueue(payment.id);
      await completion;
    } finally {
      await withDeadline(inspector.close());
    }

    const settled = await findPaymentByIdAnyMerchant(db, payment.id);
    expect(settled?.status).toBe("settled");
    expect(chain.callCount).toBe(1);
  });
});
