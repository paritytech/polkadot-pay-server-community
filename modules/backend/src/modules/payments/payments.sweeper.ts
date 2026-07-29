// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";
import { listPendingPaymentsPastExpiry } from "./payments.repo";
import type { PaymentsService } from "./payments.service";
import type { PaymentSubscriptionManager } from "./v1/listener/subscriptions";

export type PaymentSweeper = {
  tick: () => Promise<void>;
  stop: () => void;
};

export function createPaymentSweeper(
  db: Database,
  payments: PaymentsService,
  subscriptions: PaymentSubscriptionManager,
  intervalMs = 15_000,
): PaymentSweeper {
  const tick = async (): Promise<void> => {
    const now = Date.now();
    const expired = await listPendingPaymentsPastExpiry(db, now);
    for (const payment of expired) {
      await payments.expirePayment(payment.id);
    }
    await subscriptions.refreshAllSubscriptions(now);
  };

  const timer = setInterval(() => void tick(), intervalMs);
  return {
    tick,
    stop: () => {
      clearInterval(timer);
    },
  };
}
