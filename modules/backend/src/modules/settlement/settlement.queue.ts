// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Queue, Worker } from "bullmq";

import type { Database } from "../../db/client";
import { logger } from "../../lib/logger";
import { claimPaymentById, type SettlementEventType } from "./settlement.claim";
import type { SettlementChain } from "./settlement.chain";

const log = logger.child({ component: "settlement_queue" });

export const SETTLEMENT_QUEUE_NAME = "settlement-claims";

/** A claim blocks on inclusion of one transfer per coin, so the job lock must outlast chain inclusion. */
const WORKER_LOCK_MS = 120_000;

export type SettlementQueue = {
  enqueue: (paymentId: string) => Promise<void>;
  start: () => void;
  stop: () => Promise<void>;
};

export type SettlementQueueOptions = {
  db: Database;
  chain: SettlementChain;
  redisUrl: string;
  maxAttempts?: number;
  /** Emits a webhook event for each settlement transition. */
  notify?: (paymentId: string, type: SettlementEventType) => Promise<void>;
  /** Isolates queue keys when several environments share one Redis. */
  prefix?: string;
  /** Per-payment `jobId` already enforces single-flight; concurrency >1 is required so one stalled transfer cannot freeze the queue. Defaults to 4. */
  concurrency?: number;
  /** Heartbeat interval for `settling_since`; must stay well under the worker's `leaseMs` (default 5 min). Defaults to 30s. */
  leaseHeartbeatMs?: number;
};

type SettlementJobData = {
  paymentId: string;
};

export function createSettlementQueue(options: SettlementQueueOptions): SettlementQueue {
  const maxAttempts = options.maxAttempts ?? 5;
  const concurrency = options.concurrency ?? 4;
  const leaseHeartbeatMs = options.leaseHeartbeatMs ?? 30_000;
  const deps = { db: options.db, chain: options.chain, maxAttempts, leaseHeartbeatMs, notify: options.notify };
  const connection = { url: options.redisUrl, maxRetriesPerRequest: null };
  const queueOptions = options.prefix ? { connection, prefix: options.prefix } : { connection };

  let queue: Queue<SettlementJobData> | null = null;
  let worker: Worker<SettlementJobData> | null = null;
  let stopped = false;

  return {
    enqueue: async (paymentId) => {
      if (stopped) {
        log.debug({ event: "settlement_payment_enqueue_skipped", paymentId, reason: "queue_stopped" });
        return;
      }

      if (!queue) {
        queue = new Queue<SettlementJobData>(SETTLEMENT_QUEUE_NAME, queueOptions);
        queue.on("error", (err) => {
          log.error({ event: "settlement_queue_connection_error", queueName: SETTLEMENT_QUEUE_NAME, redisUrl: options.redisUrl, err });
        });
      }
      try {
        const previous = await queue.getJob(paymentId);
        if (previous) {
          const state = await previous.getState();
          if (state === "completed" || state === "failed") {
            await previous.remove();
            log.info({ event: "settlement_payment_terminal_job_cleared", paymentId, state });
          }
        }
        const job = await queue.add(
          SETTLEMENT_QUEUE_NAME,
          { paymentId },
          {
            jobId: paymentId,
            attempts: maxAttempts,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        log.info({
          event: "settlement_payment_enqueued",
          paymentId,
          jobId: job.id ?? null,
          maxAttempts,
        });
      } catch (err) {
        log.error({ event: "settlement_payment_enqueue_failed", paymentId, err });
        throw err;
      }
    },

    start: () => {
      if (worker || stopped) return;
      worker = new Worker<SettlementJobData>(
        SETTLEMENT_QUEUE_NAME,
        (job) => claimPaymentById(deps, job.data.paymentId),
        { ...queueOptions, concurrency, lockDuration: WORKER_LOCK_MS },
      );
      worker.on("ready", () => {
        log.info({ event: "settlement_queue_worker_ready", queueName: SETTLEMENT_QUEUE_NAME, concurrency });
      });
      worker.on("error", (err) => {
        log.error({ event: "settlement_queue_worker_error", queueName: SETTLEMENT_QUEUE_NAME, err });
      });
      worker.on("completed", (job) => {
        log.info({
          event: "settlement_queue_job_completed",
          queueName: SETTLEMENT_QUEUE_NAME,
          paymentId: job.data.paymentId,
          jobId: job.id ?? null,
          attemptsMade: job.attemptsMade,
        });
      });
      worker.on("failed", (job, err) => {
        log.error({
          event: "settlement_queue_job_failed",
          queueName: SETTLEMENT_QUEUE_NAME,
          paymentId: job?.data.paymentId ?? null,
          jobId: job?.id ?? null,
          attemptsMade: job?.attemptsMade ?? null,
          maxAttempts,
          err,
        });
      });
    },

    stop: async () => {
      if (stopped) return;
      stopped = true;
      const currentWorker = worker;
      const currentQueue = queue;
      worker = null;
      queue = null;
      try {
        await Promise.all([currentWorker?.close(), currentQueue?.close()]);
        log.info({ event: "settlement_queue_stopped", queueName: SETTLEMENT_QUEUE_NAME });
      } catch (err) {
        log.error({ event: "settlement_queue_stop_failed", queueName: SETTLEMENT_QUEUE_NAME, err });
        throw err;
      }
    },
  };
}
