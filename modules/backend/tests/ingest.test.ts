// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";

import { findPaymentById } from "../src/modules/payments/payments.repo.ts";
import { PaymentsService } from "../src/modules/payments/payments.service.ts";
import { StatementIngester } from "../src/modules/payments/v1/listener/ingest.ts";
import { buildStatementHex, createTestDatabase, seedMerchantWithKey } from "./helpers/payment-fixture.ts";

describe("StatementIngester", () => {
  it("completes a pending payment and emits payment.created then payment.received once", async () => {
    const db = await createTestDatabase("ingest_complete");
    const { merchant } = await seedMerchantWithKey(db);
    const eventTypes: string[] = [];
    const payments = new PaymentsService({ db, onPaymentEvent: async (_tx, type) => { eventTypes.push(type); } });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00" });
    const ingester = new StatementIngester(payments);
    await ingester.ingestTopicStatements(payment.topic_hex, [statementHex]);
    await ingester.ingestTopicStatements(payment.topic_hex, [statementHex]);
    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("received");
    expect(updated?.coin_count).toBe(1);
    expect(updated?.coins_enc).not.toBeNull();
    expect(eventTypes).toEqual(["payment.created", "payment.received"]);
  });

  it("fires onPaymentSettleable only after the receiving transaction commits", async () => {
    const db = await createTestDatabase("ingest_settleable_hook");
    const { merchant } = await seedMerchantWithKey(db);
    const observed: Array<{ status: string; committed: boolean }> = [];
    const payments = new PaymentsService({
      db,
      onPaymentSettleable: async (payment) => {
        const persisted = await findPaymentById(db, merchant.id, payment.id);
        observed.push({ status: payment.status, committed: persisted?.status === "received" });
      },
    });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00" });
    const ingester = new StatementIngester(payments);
    await ingester.ingestTopicStatements(payment.topic_hex, [statementHex]);
    await ingester.ingestTopicStatements(payment.topic_hex, [statementHex]);

    expect(observed).toEqual([{ status: "received", committed: true }]);
  });

  it("does not fire onPaymentSettleable for a paid-after-cancel payment", async () => {
    const db = await createTestDatabase("ingest_settleable_canceled");
    const { merchant } = await seedMerchantWithKey(db);
    const settleable: string[] = [];
    const payments = new PaymentsService({ db, onPaymentSettleable: async (payment) => { settleable.push(payment.id); } });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    await payments.cancelPayment(merchant.id, payment.id);
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00" });
    await new StatementIngester(payments).ingestTopicStatements(payment.topic_hex, [statementHex]);

    expect(settleable).toEqual([]);
  });

  it("ignores statements with a mismatched payload id", async () => {
    const db = await createTestDatabase("ingest_id_mismatch");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00", payloadId: "different-id" });
    await new StatementIngester(payments).ingestTopicStatements(payment.topic_hex, [statementHex]);
    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.completed_at).toBeNull();
  });

  it("skips a payment when the sealed private key is unreadable", async () => {
    const db = await createTestDatabase("ingest_bad_privkey");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    const corruptedPrivkeyEnc = `${payment.privkey_enc!.slice(0, -1)}${payment.privkey_enc!.endsWith("A") ? "B" : "A"}`;
    await db.execute("UPDATE payments SET privkey_enc = $2 WHERE id = $1", [payment.id, corruptedPrivkeyEnc]);
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00" });
    await new StatementIngester(payments).ingestTopicStatements(payment.topic_hex, [statementHex]);
    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.completed_at).toBeNull();
  });

  it("records an amount mismatch anomaly and leaves the payment pending", async () => {
    const db = await createTestDatabase("ingest_amount_mismatch");
    const { merchant } = await seedMerchantWithKey(db);
    const payments = new PaymentsService({ db });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "4.00" });
    await new StatementIngester(payments).ingestTopicStatements(payment.topic_hex, [statementHex]);
    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("pending");
    expect(updated?.anomaly).toBe("amount_mismatch:4.00");
  });

  it("stores coins for paid-after-cancel as received with anomaly, without firing payment.received", async () => {
    const db = await createTestDatabase("ingest_paid_after_cancel");
    const { merchant } = await seedMerchantWithKey(db);
    const eventTypes: string[] = [];
    const payments = new PaymentsService({ db, onPaymentEvent: async (_tx, type) => { eventTypes.push(type); } });
    const payment = await payments.createPayment(merchant, { amount: "3.00" });
    await payments.cancelPayment(merchant.id, payment.id);
    const statementHex = buildStatementHex({ paymentId: payment.id, paymentPubkeyHex: payment.pubkey_hex, amount: "3.00" });
    await new StatementIngester(payments).ingestTopicStatements(payment.topic_hex, [statementHex]);
    const updated = await findPaymentById(db, merchant.id, payment.id);
    expect(updated?.status).toBe("received");
    expect(updated?.anomaly).toBe("paid_after_cancel");
    expect(updated?.coins_enc).not.toBeNull();
    expect(eventTypes).toEqual(["payment.created", "payment.canceled"]);
  });
});
