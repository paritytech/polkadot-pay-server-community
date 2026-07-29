// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";
import { logger } from "../../lib/logger";
import {
  failPaymentSettlement,
  findPaymentByIdAnyMerchant,
  leasePaymentForSettlement,
  markPaymentClaimed,
  markPaymentConfirmingIfComplete,
  recordSubmittedClaimTxHash,
  recordIncludedPaymentCoin,
  releasePaymentSettlement,
  removeIncludedPaymentCoin,
  reopenConfirmingPayment,
  touchPaymentSettlementLease,
} from "../../modules/payments/payments.repo";
import type { PaymentRecord } from "../../modules/payments/payments.types";
import type { SettlementChain } from "./settlement.chain";
import { splitSealedCoins } from "./settlement.coins";

const log = logger.child({ component: "settlement_claim" });

/** Non-0x inclusion marker for a coin proven absent on chain after an inclusion timeout; keeps the confirming/settled coin-count gate complete without attributing a tx hash. */
const RECONCILED_COIN_MARKER = "reconciled:absent-on-chain";

export type SettlementEventType =
  | "payment.settling"
  | "payment.confirming"
  | "payment.settled"
  | "payment.failed";

export type ClaimDeps = {
  db: Database;
  chain: SettlementChain;
  maxAttempts: number;
  leaseHeartbeatMs: number;
  notify?: (paymentId: string, type: SettlementEventType) => Promise<void>;
  /** How long one attempt waits for the payer's coin-funding transfers to appear on chain (default 30s, mirroring the host app's detection window). */
  coinDetectWindowMs?: number;
  /** Poll interval within the detection window (default 3s). */
  coinDetectPollMs?: number;
};
const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

async function emitSettlementEvent(deps: ClaimDeps, paymentId: string, type: SettlementEventType): Promise<void> {
  if (!deps.notify) return;
  try {
    await deps.notify(paymentId, type);
  } catch (err) {
    log.error({ event: "settlement_event_emit_failed", paymentId, type, err });
  }
}

interface TransitionQueue {
  enqueue(op: () => Promise<void>): Promise<void>;
  drain(): Promise<void>;
}

/**
 * Single, per-payment FIFO that serializes every claim-time DB mutation
 * and lifecycle emission. Coin hook callbacks can fire in arbitrary order
 * across the Promise.allSettled goroutines; without this queue an
 * `onDropped` for coin A could resolve and reopen before coin B's aggregate
 * confirmation gate committed, leaving B's confirmation covered by a status
 * row already overwritten by retry-or-fail.
 */
function createTransitionQueue(): TransitionQueue {
  let tail: Promise<void> = Promise.resolve();
  const failures: unknown[] = [];
  return {
    enqueue(op) {
      const next = tail.then(op);
      tail = next.catch((err) => {
        failures.push(err);
      });
      return next;
    },
    async drain() {
      await tail;
      if (failures.length > 0) throw failures[0];
    },
  };
}

async function retryOrFail(
  deps: ClaimDeps,
  payment: PaymentRecord,
  message: string,
  reason: string,
  err?: unknown,
): Promise<void> {
  const attempt = payment.claim_attempts + 1;
  if (attempt >= deps.maxAttempts) {
    await failPaymentSettlement(deps.db, payment.id, message);
    await emitSettlementEvent(deps, payment.id, "payment.failed");
    log.error({
      event: "settlement_claim_failed",
      paymentId: payment.id,
      attempt,
      maxAttempts: deps.maxAttempts,
      reason,
      err,
    });
  } else {
    await releasePaymentSettlement(deps.db, payment.id, message);
    log.warn({
      event: "settlement_claim_retry_scheduled",
      paymentId: payment.id,
      attempt,
      maxAttempts: deps.maxAttempts,
      reason,
      err,
    });
  }
}

export async function settlePaymentClaim(deps: ClaimDeps, payment: PaymentRecord): Promise<void> {
  const { db, chain } = deps;
  if (payment.status === "settled" || payment.status === "failed") {
    log.error({
      event: "settlement_claim_skipped_terminal",
      paymentId: payment.id,
      status: payment.status,
    });
    return;
  }
  const attempt = payment.claim_attempts + 1;
  if (!payment.coins_enc) {
    await failPaymentSettlement(db, payment.id, "no coins to settle");
    await emitSettlementEvent(deps, payment.id, "payment.failed");
    log.error({
      event: "settlement_claim_failed",
      paymentId: payment.id,
      attempt,
      maxAttempts: deps.maxAttempts,
      reason: "coins_missing",
    });
    return;
  }

  const coins = splitSealedCoins(payment.coins_enc);
  const inclusionSet = payment.claim_included_coins;
  const coinsToTransfer = coins.filter((coin) => !(chain.coinAddress(coin) in inclusionSet));
  log.info({
    event: "settlement_claim_started",
    paymentId: payment.id,
    attempt,
    maxAttempts: deps.maxAttempts,
    coinCount: coins.length,
    coinCountToTransfer: coinsToTransfer.length,
    inclusionCount: Object.keys(inclusionSet).length,
    destinationAddress: chain.destinationAddress,
  });

  let heartbeat: NodeJS.Timeout | undefined;
  const transitions = createTransitionQueue();
  try {
    heartbeat = setInterval(() => {
      touchPaymentSettlementLease(db, payment.id, Date.now()).catch((err) => {
        log.error({ event: "settlement_lease_heartbeat_failed", paymentId: payment.id, err });
      });
    }, deps.leaseHeartbeatMs);

    try {
      const detectDeadline = Date.now() + (deps.coinDetectWindowMs ?? 30_000);
      let dispositions = await Promise.all(
        coinsToTransfer.map(async (coin) => ({ coin, disposition: await chain.coinDisposition(coin) })),
      );
      while (dispositions.some((entry) => entry.disposition === "missing") && Date.now() < detectDeadline) {
        await delay(deps.coinDetectPollMs ?? 3_000);
        dispositions = await Promise.all(
          dispositions.map(async (entry) =>
            entry.disposition === "missing"
              ? { coin: entry.coin, disposition: await chain.coinDisposition(entry.coin) }
              : entry,
          ),
        );
      }
      const missing = dispositions.filter((entry) => entry.disposition === "missing");
      if (missing.length > 0) {
        log.warn({
          event: "settlement_claim_coins_not_detected",
          paymentId: payment.id,
          attempt,
          maxAttempts: deps.maxAttempts,
          missingCoinAddresses: missing.map((entry) => chain.coinAddress(entry.coin)),
        });
        throw new Error(
          `${missing.length} of ${coins.length} coins not yet on chain — the payer's coin transfers may still be in flight; will retry`,
        );
      }
      for (const entry of dispositions) {
        if (entry.disposition !== "purse") continue;
        await recordIncludedPaymentCoin(db, payment.id, chain.coinAddress(entry.coin), RECONCILED_COIN_MARKER);
      }
      const transferable = dispositions.filter((entry) => entry.disposition === "source").map((entry) => entry.coin);
      const stale = await findPaymentByIdAnyMerchant(db, payment.id);
      if (!stale || (stale.status !== "settling" && stale.status !== "confirming")) {
        log.error({
          event: "settlement_claim_aborted_stale",
          paymentId: payment.id,
          status: stale?.status ?? "not_found",
        });
        return;
      }
      const results = await Promise.allSettled(
        transferable.map(async (coin) => {
          const coinAddress = chain.coinAddress(coin);
          const result = await chain.transferCoin(coin, {
            onSubmitted: async (txHash) => {
              try {
                await recordSubmittedClaimTxHash(db, payment.id, coinAddress, txHash);
              } catch (err) {
                log.error({
                  event: "settlement_claim_submitted_hash_record_failed",
                  paymentId: payment.id,
                  txHash,
                  err,
                });
              }
            },
            onIncluded: async (txHash) => {
              await transitions.enqueue(async () => {
                await touchPaymentSettlementLease(db, payment.id, Date.now());
                await recordIncludedPaymentCoin(db, payment.id, coinAddress, txHash);
                const transitioned = await markPaymentConfirmingIfComplete(db, payment.id, txHash, Date.now());
                if (!transitioned) return;
                await emitSettlementEvent(deps, payment.id, "payment.confirming");
                log.info({ event: "settlement_claim_confirming", paymentId: payment.id, txHash });
              });
            },
            onFinalized: (txHash) => {
              log.info({ event: "settlement_claim_finalized", paymentId: payment.id, txHash });
            },
            onDropped: async (txHash, reason) => {
              await transitions.enqueue(async () => {
                const removed = await removeIncludedPaymentCoin(db, payment.id, coinAddress, txHash);
                log.error({
                  event: "settlement_claim_transfer_dropped",
                  paymentId: payment.id,
                  txHash,
                  reason,
                  removed,
                });
                if (!removed) {
                  log.error({
                    event: "settlement_drop_ignored_payment_settled",
                    paymentId: payment.id,
                    txHash,
                    reason,
                    note: "drop signal arrived after settlement; state was NOT reverted; operator should reconcile the coin on chain",
                  });
                  return;
                }
                const reopened = await reopenConfirmingPayment(db, payment.id, reason);
                if (!reopened) {
                  log.error({
                    event: "settlement_drop_ignored_payment_settled",
                    paymentId: payment.id,
                    txHash,
                    reason,
                    note: "drop signal arrived after settlement; state was NOT reverted; operator should reconcile the coin on chain",
                  });
                  return;
                }
                await emitSettlementEvent(deps, payment.id, "payment.settling");
              });
            },
          });
          await touchPaymentSettlementLease(db, payment.id, Date.now());
          await transitions.enqueue(async () => {
            await recordIncludedPaymentCoin(db, payment.id, coinAddress, result.txHash ?? RECONCILED_COIN_MARKER);
          });
          return result;
        }),
      );
      await transitions.drain();
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (rejected) throw rejected.reason;
      await transitions.enqueue(async () => {
        const settled = await markPaymentClaimed(db, payment.id, payment.claim_tx_hash, Date.now());
        if (!settled) return;
        await emitSettlementEvent(deps, payment.id, "payment.settled");
      });
      await transitions.drain();
      log.info({
        event: "settlement_claim_completed",
        paymentId: payment.id,
        attempt,
        coinCount: coins.length,
        transferredCount: transferable.length,
        purseRecoveredCount: coinsToTransfer.length - transferable.length,
        txHash: payment.claim_tx_hash,
      });
    } catch (err) {
      await transitions.drain();
      await retryOrFail(
        deps,
        payment,
        err instanceof Error ? err.message : String(err),
        "coin_transfer_failed",
        err,
      );
      return;
    }
  } finally {
    clearInterval(heartbeat);
  }
}

export async function claimPaymentById(deps: ClaimDeps, paymentId: string): Promise<void> {
  try {
    const lease = await leasePaymentForSettlement(deps.db, paymentId, Date.now());
    if (!lease.leased) {
      log.debug({ event: "settlement_claim_skipped", paymentId, reason: "lease_not_acquired" });
      return;
    }
    if (lease.firstLease) await emitSettlementEvent(deps, paymentId, "payment.settling");

    const payment = await findPaymentByIdAnyMerchant(deps.db, paymentId);
    if (!payment) {
      log.warn({ event: "settlement_claim_skipped", paymentId, reason: "payment_not_found" });
      return;
    }

    await settlePaymentClaim(deps, payment);
  } catch (err) {
    log.error({ event: "settlement_claim_error", paymentId, err });
    throw err;
  }
}
