// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";
import { logger } from "../../lib/logger";
import { listUnclaimedPaymentsForSettlement, reclaimStalePaymentSettlements } from "../../modules/payments/payments.repo";
import type { SettlementQueue } from "./settlement.queue";

const log = logger.child({ component: "settlement_worker" });

export type SettlementWorker = {
  tick: () => Promise<void>;
  start: () => void;
  stop: () => void;
};

export type SettlementWorkerOptions = {
  queue: SettlementQueue;
  intervalMs?: number;
  batchSize?: number;
  leaseMs?: number;
};

export function createSettlementWorker(db: Database, options: SettlementWorkerOptions): SettlementWorker {
  const { queue } = options;
  const intervalMs = options.intervalMs ?? 20_000;
  const batchSize = options.batchSize ?? 10;
  const leaseMs = options.leaseMs ?? 5 * 60_000;

  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      log.debug({ event: "settlement_poll_skipped", reason: "already_running" });
      return;
    }

    running = true;
    const startedAt = Date.now();
    let recoveredCount = 0;
    let pendingCount = 0;
    let enqueuedCount = 0;
    log.debug({ event: "settlement_poll_started", batchSize, leaseMs });

    try {
      recoveredCount = await reclaimStalePaymentSettlements(db, Date.now() - leaseMs);
      if (recoveredCount > 0) {
        log.warn({ event: "settlement_stale_leases_recovered", recoveredCount });
      }

      const pending = await listUnclaimedPaymentsForSettlement(db, batchSize);
      pendingCount = pending.length;
      for (const payment of pending) {
        await queue.enqueue(payment.id);
        enqueuedCount += 1;
      }

      log.debug({
        event: "settlement_poll_completed",
        recoveredCount,
        pendingCount,
        enqueuedCount,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      log.error({
        event: "settlement_poll_failed",
        err,
        recoveredCount,
        pendingCount,
        enqueuedCount,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    } finally {
      running = false;
    }
  };

  return {
    tick,
    start: () => {
      if (timer) return;
      timer = setInterval(() => void tick(), intervalMs);
      void tick();
      log.info({ event: "settlement_poll_scheduler_started", intervalMs, batchSize, leaseMs });
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info({ event: "settlement_poll_scheduler_stopped" });
      }
    },
  };
}
