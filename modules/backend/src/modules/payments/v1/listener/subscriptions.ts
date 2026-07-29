// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { config } from "../../../../env";
import type { ChainState } from "../../../../types";
import type { Database } from "../../../../db/client";
import { listPaymentsForListening, purgeExpiredPaymentKeys } from "../../payments.repo";
import type { PaymentsService } from "../../payments.service";
import type { PaymentRecord } from "../../payments.types";

import { StatementIngester } from "./ingest";
import { StatementRpcClient } from "./rpc-client";

const LATE_COMPLETION_WINDOW_MS = 48 * 60 * 60 * 1000;

export class PaymentSubscriptionManager {
  private readonly chainState: ChainState = { chain: "reconnecting", pendingSubscriptions: 0 };
  private readonly ingester: StatementIngester;
  private readonly rpcClient: StatementRpcClient;
  private readonly trackedTopics = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly payments: PaymentsService,
  ) {
    this.ingester = new StatementIngester(payments);
    this.rpcClient = new StatementRpcClient({
      url: config.peopleRpcUrl,
      onStatements: (topicHex, statements) => {
        void this.ingester.ingestTopicStatements(topicHex, statements);
      },
      onStateChange: (state) => {
        this.chainState.chain = state;
      },
    });
  }

  async start(): Promise<void> {
    this.rpcClient.start();
    await this.refreshAllSubscriptions();
  }

  stop(): void {
    this.rpcClient.stop();
  }

  getChainState(): ChainState {
    this.chainState.pendingSubscriptions = this.rpcClient.getDesiredSubscriptionCount();
    return { ...this.chainState };
  }

  async refreshAllSubscriptions(now = Date.now()): Promise<void> {
    await purgeExpiredPaymentKeys(this.db, now - LATE_COMPLETION_WINDOW_MS);

    const payments = await listPaymentsForListening(this.db, now, LATE_COMPLETION_WINDOW_MS);
    const activeTopics = new Set(payments.map((payment) => payment.topic_hex));

    for (const payment of payments) {
      this.rpcClient.subscribe(payment.topic_hex);
      this.trackedTopics.add(payment.topic_hex);
    }

    for (const topicHex of this.trackedTopics) {
      if (!activeTopics.has(topicHex)) {
        this.rpcClient.unsubscribe(topicHex);
        this.trackedTopics.delete(topicHex);
      }
    }
  }

  async syncPayment(payment: PaymentRecord): Promise<void> {
    const withinLateWindow = payment.expires_at > Date.now() - LATE_COMPLETION_WINDOW_MS;
    const shouldListen =
      payment.privkey_enc !== null &&
      withinLateWindow &&
      (payment.status === "pending" || payment.status === "expired" || payment.status === "canceled");

    if (shouldListen) {
      this.rpcClient.subscribe(payment.topic_hex);
      this.trackedTopics.add(payment.topic_hex);
      return;
    }
    this.rpcClient.unsubscribe(payment.topic_hex);
    this.trackedTopics.delete(payment.topic_hex);
  }
}
