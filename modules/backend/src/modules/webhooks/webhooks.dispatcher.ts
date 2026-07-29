// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { open } from "../../lib/crypto";
import type { Database } from "../../db/client";
import {
  listDueWebhookDeliveries,
  markWebhookDeliveryFailed,
  markWebhookDeliveryRetry,
  markWebhookDeliverySuccess,
} from "./webhooks.repo";
import { signPayload } from "./webhooks.sign";

const RETRY_DELAYS_MS = [0, 30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000] as const;

export class WebhookDispatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly intervalMs = 5_000,
    private readonly batchSize = 20,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.flushDue();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flushDue(now = Date.now()): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const due = await listDueWebhookDeliveries(this.db, now, this.batchSize);
      for (const delivery of due) {
        await this.deliverOne(delivery.id, delivery.endpoint_url, delivery.endpoint_secret_enc, delivery.event_payload, delivery.attempt_count);
      }
    } finally {
      this.running = false;
    }
  }

  private async deliverOne(
    deliveryId: string,
    endpointUrl: string,
    endpointSecretEnc: string,
    payload: string,
    priorAttempts: number,
  ): Promise<void> {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const signature = signPayload(open(endpointSecretEnc), payload, timestampSeconds);

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "payment-processor-signature": signature,
          "payment-processor-event-id": JSON.parse(payload).id as string,
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status >= 200 && response.status < 300) {
        await markWebhookDeliverySuccess(this.db, deliveryId, response.status, Date.now());
        return;
      }

      await this.scheduleRetry(deliveryId, priorAttempts, response.status, `HTTP ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.scheduleRetry(deliveryId, priorAttempts, null, message);
    }
  }

  private async scheduleRetry(
    deliveryId: string,
    priorAttempts: number,
    statusCode: number | null,
    lastError: string,
  ): Promise<void> {
    const nextAttemptCount = priorAttempts + 1;
    if (nextAttemptCount >= RETRY_DELAYS_MS.length) {
      await markWebhookDeliveryFailed(this.db, deliveryId, statusCode, lastError);
      return;
    }
    await markWebhookDeliveryRetry(
      this.db,
      deliveryId,
      statusCode,
      lastError,
      Date.now() + RETRY_DELAYS_MS[nextAttemptCount],
    );
  }
}
