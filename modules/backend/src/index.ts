// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createApp } from "./app";
import { config } from "./env";
import { openDatabase } from "./db/client";
import { logger } from "./lib/logger";
import { EventsService } from "./modules/events/events.service";
import { PaymentSubscriptionManager } from "./modules/payments/v1/listener/subscriptions";
import { PaymentsService } from "./modules/payments/payments.service";
import { createPaymentSweeper } from "./modules/payments/payments.sweeper";
import { createSettlementChain } from "./modules/settlement/settlement.chain";
import { createSettlementQueue } from "./modules/settlement/settlement.queue";
import { createSettlementWorker } from "./modules/settlement/settlement.worker";
import { WebhookDispatcher } from "./modules/webhooks/webhooks.dispatcher";

const log = logger.child({ component: "application" });

const db = await openDatabase();
const events = new EventsService();
const payments = new PaymentsService({ db });
const subscriptions = new PaymentSubscriptionManager(db, payments);
const sweeper = createPaymentSweeper(db, payments, subscriptions);
const dispatcher = new WebhookDispatcher(db);
const settlementChain = config.operatorMnemonic !== undefined
  ? createSettlementChain({
      rpcUrl: config.peopleRpcUrl,
      mnemonic: config.operatorMnemonic,
      accountPath: config.settlement.accountPath,
      authorizationKey: config.paymentsV1AuthKey,
    })
  : null;
const settlementQueue = settlementChain !== null
  ? createSettlementQueue({
      db,
      chain: settlementChain,
      redisUrl: config.redisUrl,
      notify: async (paymentId, type) => {
        await payments.emitLifecycleEvent(paymentId, type);
      },
      maxAttempts: config.settlement.maxClaimAttempts,
    })
  : null;
const settlementWorker = settlementQueue
  ? createSettlementWorker(db, { queue: settlementQueue, intervalMs: config.settlement.pollMs })
  : null;

payments.setHooks({
  onPaymentEvent: async (transaction, type, payment, record) => {
    await events.emit(transaction, record.merchant_id, type, payment, payment.id);
  },
  onPaymentCreated: async (payment) => {
    await subscriptions.syncPayment(payment);
  },
  onPaymentChanged: async (payment) => {
    await subscriptions.syncPayment(payment);
  },
  onPaymentSettleable: async (payment) => {
    if (!settlementQueue || payment.status !== "received" || payment.coins_enc === null) return;
    try {
      await settlementQueue.enqueue(payment.id);
    } catch (err) {
      log.error({ event: "settlement_immediate_enqueue_failed", paymentId: payment.id, err });
    }
  },
});

export const app = createApp({ db, payments, events, getChainState: () => subscriptions.getChainState() });
await subscriptions.start();
dispatcher.start();
if (settlementWorker && settlementQueue && settlementChain) {
  settlementQueue.start();
  settlementWorker.start();
  log.info({
    event: "settlement_service_started",
    destinationAddress: settlementChain.destinationAddress,
  });
  if (config.paymentsV1AuthKey === undefined) {
    log.warn({
      event: "settlement_authorization_key_missing",
      message: "PAYMENTS_V1_AUTH_KEY is unset; Coinage coin transfers will be rejected with System.CallFiltered",
    });
  }
}

const server = Bun.serve({ port: config.port, fetch: app.fetch });

async function shutdown(signal: string): Promise<void> {
  log.info({ event: "app_shutdown_started", signal });
  try {
    dispatcher.stop();
    sweeper.stop();
    settlementWorker?.stop();
    await settlementQueue?.stop();
    subscriptions.stop();
    await settlementChain?.close();
    await db.close();
    log.info({ event: "app_shutdown_completed", signal });
  } catch (err) {
    log.error({ event: "app_shutdown_failed", signal, err });
    throw err;
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

log.info({ event: "app_started", port: server.port, settlementEnabled: settlementWorker !== null });
