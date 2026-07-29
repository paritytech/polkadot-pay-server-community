// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { CodecError } from "../wire/codec";
import { decryptStatementData, EciesError } from "../wire/ecies";
import { normalizeAmount } from "../deeplink";
import { open } from "../../../../lib/crypto";
import type { PaymentsService } from "../../payments.service";

import { extractStatementData } from "./statement";

export class StatementIngester {
  private readonly malformedTopics = new Set<string>();
  private readonly invalidPrivkeyTopics = new Set<string>();

  constructor(private readonly payments: PaymentsService) {}

  async ingestTopicStatements(topicHex: string, statements: string[]): Promise<void> {
    const payment = await this.payments.findByTopicHex(topicHex);
    if (!payment || !payment.privkey_enc) {
      return;
    }
    if (payment.status !== "pending" && payment.status !== "expired" && payment.status !== "canceled") {
      return;
    }

    let privateKey: Uint8Array;
    try {
      privateKey = open(payment.privkey_enc);
    } catch {
      if (!this.invalidPrivkeyTopics.has(topicHex)) {
        this.invalidPrivkeyTopics.add(topicHex);
        console.warn(`Unreadable sealed private key skipped for topic ${topicHex}`);
      }
      return;
    }

    for (const statement of statements) {
      const data = extractStatementData(statement);
      if (!data) {
        if (!this.malformedTopics.has(topicHex)) {
          this.malformedTopics.add(topicHex);
          console.warn(`Malformed statement skipped for topic ${topicHex}`);
        }
        continue;
      }

      try {
        const { payload } = decryptStatementData(privateKey, data);
        if (payload.id !== payment.id) {
          continue;
        }

        if (normalizeAmount(payload.amount) !== payment.amount) {
          await this.payments.storeAmountMismatch(payment.id, payload.amount);
          continue;
        }

        if (payload.coins.length < 1) {
          continue;
        }

        await this.payments.completeFromCheque(payment.id, payload);
        return;
      } catch (error) {
        if (error instanceof CodecError || error instanceof EciesError) {
          continue;
        }
        throw error;
      }
    }
  }
}
