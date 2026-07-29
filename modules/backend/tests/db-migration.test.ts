// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import "./helpers/test-env.ts";

import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { createMerchantRecord, getMerchant } from "../src/modules/accounts/accounts.repo.ts";
import { openDatabase, type Database } from "../src/db/client.ts";
import postgres from "postgres";
import journal from "../src/db/migrations/meta/_journal.json";

const BASELINE_TABLES = ["merchants", "api_keys", "payments", "events", "webhook_endpoints", "webhook_deliveries"] as const;

const MIGRATION_COUNT = journal.entries.length;

const cleanupSchemas: string[] = [];

async function dropSchemas(): Promise<void> {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) return;
  const admin = await openDatabase(databaseUrl);
  try {
    for (const schema of cleanupSchemas.splice(0)) await admin.execute(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await admin.close();
  }
}

afterEach(dropSchemas);
afterAll(dropSchemas);

function randomSchemaName(label: string): string {
  const slug = label.replaceAll(/[^a-zA-Z0-9_]/g, "_").slice(0, 20);
  const suffix = crypto.randomUUID().replaceAll("-", "");
  return `pp_${slug}_${suffix}`.toLowerCase();
}

async function provisionIsolatedSchema(label: string, databaseUrl: string): Promise<{ schema: string; db: Database }> {
  const schema = randomSchemaName(label);
  const admin = await openDatabase(databaseUrl);
  try {
    await admin.execute(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.close();
  }
  cleanupSchemas.push(schema);
  const db = await openDatabase(databaseUrl, schema);
  return { schema, db };
}

async function tableInCurrentSchema(db: Database, tableName: string): Promise<boolean> {
  const row = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [tableName],
  );
  return Number(row?.count ?? 0) > 0;
}


function requireDatabaseUrl(): string {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  return databaseUrl;
}

interface ConstraintRow extends Record<string, unknown> {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
}

interface IndexRow extends Record<string, unknown> {
  indexname: string;
  tablename: string;
}

interface ForeignKeyRow extends Record<string, unknown> {
  constraint_name: string;
  source_table: string;
  target_table: string;
}

const LEGACY_FK_DEFINITIONS: ReadonlyArray<{
  table: string;
  constraintName: string;
  columns: ReadonlyArray<string>;
  targetTable: string;
  targetColumns: ReadonlyArray<string>;
}> = [
  {
    table: "api_keys",
    constraintName: "api_keys_merchant_id_fkey",
    columns: ["merchant_id"],
    targetTable: "merchants",
    targetColumns: ["id"],
  },
  {
    table: "payments",
    constraintName: "payments_merchant_id_fkey",
    columns: ["merchant_id"],
    targetTable: "merchants",
    targetColumns: ["id"],
  },
  {
    table: "webhook_endpoints",
    constraintName: "webhook_endpoints_merchant_id_fkey",
    columns: ["merchant_id"],
    targetTable: "merchants",
    targetColumns: ["id"],
  },
  {
    table: "webhook_deliveries",
    constraintName: "webhook_deliveries_event_id_fkey",
    columns: ["event_id"],
    targetTable: "events",
    targetColumns: ["id"],
  },
  {
    table: "webhook_deliveries",
    constraintName: "webhook_deliveries_endpoint_id_fkey",
    columns: ["endpoint_id"],
    targetTable: "webhook_endpoints",
    targetColumns: ["id"],
  },
];

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export interface LegacySeed {
  merchantId: string;
  apiKeyId: string;
  paymentId: string;
  eventId: string;
  endpointId: string;
  deliveryId: string;
}

async function seedLegacySchema(sql: ReturnType<typeof postgres>, schemaName: string): Promise<LegacySeed> {
  const q = (identifier: string) => `${quoteIdentifier(schemaName)}.${quoteIdentifier(identifier)}`;
  const ts = Date.now();

  await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}`);

  await sql.unsafe(`
    CREATE TABLE ${q("schema_version")} (
      "version" integer PRIMARY KEY,
      "applied_at" bigint NOT NULL
    )
  `);


  await sql.unsafe(`
    CREATE TABLE ${q("merchants")} (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "created_at" bigint NOT NULL
    )
  `);

  await sql.unsafe(`
    CREATE TABLE ${q("api_keys")} (
      "id" text PRIMARY KEY NOT NULL,
      "merchant_id" text NOT NULL,
      "key_hash" text NOT NULL,
      "last4" text NOT NULL,
      "label" text,
      "created_at" bigint NOT NULL,
      "revoked_at" bigint,
      CONSTRAINT "api_keys_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES ${q("merchants")}("id"),
      CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash")
    )
  `);

  await sql.unsafe(`
    CREATE TABLE ${q("events")} (
      "id" text PRIMARY KEY NOT NULL,
      "merchant_id" text NOT NULL,
      "type" text NOT NULL,
      "payment_id" text,
      "payload" text NOT NULL,
      "created_at" bigint NOT NULL
    )
  `);

  await sql.unsafe(`
    CREATE TABLE ${q("payments")} (
      "id" text PRIMARY KEY NOT NULL,
      "merchant_id" text NOT NULL,
      "status" text NOT NULL,
      "amount" text NOT NULL,
      "currency" text DEFAULT 'CASH' NOT NULL,
      "description" text,
      "reference" text,
      "metadata" text DEFAULT '{}' NOT NULL,
      "display_name" text,
      "idempotency_key" text,
      "topic_hex" text NOT NULL,
      "deeplink" text NOT NULL,
      "privkey_enc" text,
      "pubkey_hex" text NOT NULL,
      "coins_enc" text,
      "coin_count" integer,
      "paid_amount" text,
      "payer_timestamp_ms" bigint,
      "settlement_status" text DEFAULT 'none' NOT NULL,
      "anomaly" text,
      "created_at" bigint NOT NULL,
      "expires_at" bigint NOT NULL,
      "completed_at" bigint,
      "canceled_at" bigint,
      CONSTRAINT "payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES ${q("merchants")}("id"),
      CONSTRAINT "payments_status_check" CHECK ("status" IN ('pending','completed','expired','canceled')),
      CONSTRAINT "payments_settlement_status_check" CHECK ("settlement_status" IN ('none','unclaimed','exported','claimed')),
      CONSTRAINT "payments_topic_hex_key" UNIQUE ("topic_hex")
    )
  `);

  await sql.unsafe(`
    CREATE TABLE ${q("webhook_endpoints")} (
      "id" text PRIMARY KEY NOT NULL,
      "merchant_id" text NOT NULL,
      "url" text NOT NULL,
      "events" text DEFAULT '["*"]' NOT NULL,
      "secret_enc" text NOT NULL,
      "status" text DEFAULT 'enabled' NOT NULL,
      "created_at" bigint NOT NULL,
      "deleted_at" bigint,
      CONSTRAINT "webhook_endpoints_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES ${q("merchants")}("id")
    )
  `);

  await sql.unsafe(`
    CREATE TABLE ${q("webhook_deliveries")} (
      "id" text PRIMARY KEY NOT NULL,
      "event_id" text NOT NULL,
      "endpoint_id" text NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "attempt_count" integer DEFAULT 0 NOT NULL,
      "next_attempt_at" bigint NOT NULL,
      "last_status_code" integer,
      "last_error" text,
      "delivered_at" bigint,
      "created_at" bigint NOT NULL,
      CONSTRAINT "webhook_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES ${q("events")}("id"),
      CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES ${q("webhook_endpoints")}("id"),
      CONSTRAINT "webhook_deliveries_status_check" CHECK ("status" IN ('pending','succeeded','failed'))
    )
  `);
  await sql.unsafe(`CREATE INDEX "idx_events_list" ON ${q("events")} ("merchant_id","created_at" DESC NULLS LAST)`);
  await sql.unsafe(
    `CREATE UNIQUE INDEX "idx_payments_idem" ON ${q("payments")} ("merchant_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
  );
  await sql.unsafe(`CREATE INDEX "idx_payments_list" ON ${q("payments")} ("merchant_id","created_at" DESC NULLS LAST)`);
  await sql.unsafe(`CREATE INDEX "idx_payments_pending" ON ${q("payments")} ("status","expires_at")`);
  await sql.unsafe(`CREATE INDEX "idx_deliveries_due" ON ${q("webhook_deliveries")} ("status","next_attempt_at")`);

  await sql.unsafe(
    `INSERT INTO ${q("schema_version")} ("version", "applied_at") VALUES ($1, $2)`,
    [1, ts],
  );


  const merchantId = "mch_legacy_seed";
  const apiKeyId = "ake_legacy_seed";
  const paymentId = "pay_legacy_seed";
  const eventId = "evt_legacy_seed";
  const endpointId = "whe_legacy_seed";
  const deliveryId = "whd_legacy_seed";

  await sql.unsafe(
    `INSERT INTO ${q("merchants")} ("id", "name", "created_at") VALUES ($1, $2, $3)`,
    [merchantId, "Legacy Seed Merchant", ts],
  );
  await sql.unsafe(
    `INSERT INTO ${q("api_keys")} ("id", "merchant_id", "key_hash", "last4", "label", "created_at") VALUES ($1, $2, $3, $4, $5, $6)`,
    [apiKeyId, merchantId, "seed_key_hash_0001", "0001", "seed", ts],
  );
  await sql.unsafe(
    `INSERT INTO ${q("events")} ("id", "merchant_id", "type", "payment_id", "payload", "created_at") VALUES ($1, $2, $3, $4, $5, $6)`,
    [eventId, merchantId, "payment.completed", null, `{"id":"${eventId}","object":"event","type":"payment.completed"}`, ts],
  );
  await sql.unsafe(
    `INSERT INTO ${q("payments")} ("id", "merchant_id", "status", "amount", "currency", "description", "reference", "metadata", "display_name", "idempotency_key", "topic_hex", "deeplink", "privkey_enc", "pubkey_hex", "coins_enc", "coin_count", "paid_amount", "payer_timestamp_ms", "settlement_status", "anomaly", "created_at", "expires_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      paymentId,
      merchantId,
      "pending",
      "1.00",
      "CASH",
      "seed",
      null,
      "{}",
      null,
      null,
      "seedtopic000000000000000000000000000000000000000000000000",
      "polkadot:seed",
      null,
      "00",
      null,
      null,
      null,
      null,
      "none",
      null,
      ts,
      ts + 60_000,
    ],
  );
  await sql.unsafe(
    `INSERT INTO ${q("webhook_endpoints")} ("id", "merchant_id", "url", "events", "secret_enc", "status", "created_at") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [endpointId, merchantId, "https://example.test/hook", '["payment.completed","payment.expired"]', "00", "enabled", ts],
  );
  await sql.unsafe(
    `INSERT INTO ${q("webhook_deliveries")} ("id", "event_id", "endpoint_id", "status", "attempt_count", "next_attempt_at", "last_status_code", "last_error", "delivered_at", "created_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [deliveryId, eventId, endpointId, "pending", 0, ts + 1_000, null, null, null, ts],
  );

  return { merchantId, apiKeyId, paymentId, eventId, endpointId, deliveryId };
}


describe("schema migration", () => {
  it("provisions usable baseline tables on a clean isolated schema", async () => {
    const databaseUrl = requireDatabaseUrl();

    const { schema, db } = await provisionIsolatedSchema("clean", databaseUrl);
    expect(cleanupSchemas).toContain(schema);

    for (const tableName of BASELINE_TABLES) {
      expect(await tableInCurrentSchema(db, tableName)).toBe(true);
    }

    const merchantId = "mch_smoke";
    const merchantName = "Smoke Merchant";
    const createdAt = Date.now();
    await createMerchantRecord(db, { id: merchantId, name: merchantName, created_at: createdAt });
    const fetched = await getMerchant(db, merchantId);
    expect(fetched?.id).toBe(merchantId);
    expect(fetched?.name).toBe(merchantName);
    expect(fetched?.created_at).toBe(createdAt);

    expect(await tableInCurrentSchema(db, "schema_version")).toBe(false);

    await db.close();
  });

  it("absorbs the full legacy isolated schema, preserves every row, and records every journal entry", async () => {
    const databaseUrl = requireDatabaseUrl();
    const schema = randomSchemaName("legacy_full");
    cleanupSchemas.push(schema);

    const setup = postgres(databaseUrl, { max: 1 });
    let seed: LegacySeed;
    try {
      seed = await seedLegacySchema(setup, schema);
    } finally {
      await setup.end({ timeout: 5 });
    }

    const db = await openDatabase(databaseUrl, schema);

    expect(await tableInCurrentSchema(db, "schema_version")).toBe(false);

    for (const tableName of BASELINE_TABLES) {
      expect(await tableInCurrentSchema(db, tableName)).toBe(true);
    }

    const constraints = (await db.query<ConstraintRow>(
      `SELECT table_name, constraint_name, constraint_type
         FROM information_schema.table_constraints
        WHERE table_schema = current_schema()
          AND constraint_type IN ('UNIQUE','FOREIGN KEY','CHECK')
        ORDER BY table_name, constraint_name`,
    )).map((row) => row.constraint_name).sort();
    expect(constraints).not.toContain("api_keys_key_hash_key");
    expect(constraints).not.toContain("payments_topic_hex_key");
    expect(constraints).toContain("api_keys_key_hash_unique");
    expect(constraints).toContain("payments_topic_hex_unique");
    expect(constraints.filter((n) => n === "api_keys_key_hash_unique")).toHaveLength(1);
    expect(constraints.filter((n) => n === "payments_topic_hex_unique")).toHaveLength(1);

    expect(constraints).toContain("payments_status_check");
    expect(constraints).not.toContain("payments_settlement_status_check");
    expect(constraints).toContain("webhook_deliveries_status_check");
    expect(constraints.filter((n) => n === "payments_status_check")).toHaveLength(1);
    expect(constraints.filter((n) => n === "webhook_deliveries_status_check")).toHaveLength(1);

    const foreignKeys = await db.query<ForeignKeyRow>(
      `SELECT tc.constraint_name,
              tc.table_name AS source_table,
              ccu.table_name AS target_table
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.constraint_schema
        WHERE tc.table_schema = current_schema()
          AND tc.constraint_type = 'FOREIGN KEY'`,
    );
    const fkSignatures = foreignKeys
      .map((row) => `${row.source_table}->${row.target_table}`)
      .sort();
    expect(fkSignatures).toEqual([
      "api_keys->merchants",
      "payments->merchants",
      "webhook_deliveries->events",
      "webhook_deliveries->webhook_endpoints",
      "webhook_endpoints->merchants",
    ]);
    expect(foreignKeys).toHaveLength(5);
    expect(foreignKeys.some((row) => row.source_table === "events")).toBe(false);

    for (const fk of LEGACY_FK_DEFINITIONS) {
      const currentName = `${fk.table}_${fk.columns[0]}_${fk.targetTable}_${fk.targetColumns[0]}_fk`;
      expect(constraints).toContain(currentName);
      expect(constraints).not.toContain(fk.constraintName);
    }

    const indexRows = await db.query<IndexRow>(
      `SELECT indexname, tablename
         FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ('idx_events_list','idx_payments_idem','idx_payments_list','idx_payments_pending','idx_payments_settlement','idx_deliveries_due')
        ORDER BY indexname`,
    );
    expect(indexRows.map((row) => row.indexname)).toEqual([
      "idx_deliveries_due",
      "idx_events_list",
      "idx_payments_idem",
      "idx_payments_list",
      "idx_payments_pending",
      "idx_payments_settlement",
    ]);

    const remainingRows = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'schema_version'`,
    );
    expect(Number(remainingRows?.count ?? 0)).toBe(0);

    expect(await tableInCurrentSchema(db, "__drizzle_migrations")).toBe(true);

    const journalBefore = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}.__drizzle_migrations`,
    );
    expect(Number(journalBefore?.count ?? 0)).toBe(MIGRATION_COUNT);

    const merchantCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."merchants" WHERE "id" = $1`,
      [seed.merchantId],
    );
    expect(Number(merchantCount?.count ?? 0)).toBe(1);
    const apiKeyCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."api_keys" WHERE "id" = $1`,
      [seed.apiKeyId],
    );
    expect(Number(apiKeyCount?.count ?? 0)).toBe(1);
    const eventCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."events" WHERE "id" = $1`,
      [seed.eventId],
    );
    expect(Number(eventCount?.count ?? 0)).toBe(1);
    const renamedEvent = await db.queryOne<{ type: string; payload: string }>(
      `SELECT "type", "payload" FROM ${quoteIdentifier(schema)}."events" WHERE "id" = $1`,
      [seed.eventId],
    );
    expect(renamedEvent?.type).toBe("payment.received");
    expect(renamedEvent?.payload).toContain('"type":"payment.received"');
    const paymentCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."payments" WHERE "id" = $1`,
      [seed.paymentId],
    );
    expect(Number(paymentCount?.count ?? 0)).toBe(1);
    const receivedColumn = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'payments'
          AND column_name = 'received_at'
          AND data_type = 'bigint'`,
    );
    expect(Number(receivedColumn?.count ?? 0)).toBe(1);
    const endpointCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."webhook_endpoints" WHERE "id" = $1`,
      [seed.endpointId],
    );
    expect(Number(endpointCount?.count ?? 0)).toBe(1);
    const renamedSubscription = await db.queryOne<{ events: string }>(
      `SELECT "events" FROM ${quoteIdentifier(schema)}."webhook_endpoints" WHERE "id" = $1`,
      [seed.endpointId],
    );
    expect(JSON.parse(renamedSubscription?.events ?? "[]")).toEqual(["payment.received", "payment.expired"]);
    const deliveryCount = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."webhook_deliveries" WHERE "id" = $1`,
      [seed.deliveryId],
    );
    expect(Number(deliveryCount?.count ?? 0)).toBe(1);

    await db.close();

    const reopened = await openDatabase(databaseUrl, schema);
    try {
      const journalAfter = await reopened.queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}.__drizzle_migrations`,
      );
      expect(Number(journalAfter?.count ?? 0)).toBe(MIGRATION_COUNT);

      const deliveriesAfter = await reopened.queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(schema)}."webhook_deliveries" WHERE "id" = $1`,
        [seed.deliveryId],
      );
      expect(Number(deliveriesAfter?.count ?? 0)).toBe(1);
    } finally {
      await reopened.close();
    }
  });

  it("accepts 'confirming' in the payments status CHECK constraint and indexes the settlement partial predicate", async () => {
    const databaseUrl = requireDatabaseUrl();
    const { db } = await provisionIsolatedSchema("confirming", databaseUrl);

    const now = Date.now();
    const merchantId = "mch_confirming_test";
    await createMerchantRecord(db, { id: merchantId, name: "Confirming Test Merchant", created_at: now });
    await db.execute(
      `INSERT INTO "payments" ("id","merchant_id","status","amount","topic_hex","deeplink","pubkey_hex","created_at","expires_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      ["pay_confirming_test", merchantId, "received", "1.00", "0x" + "11".repeat(32), "polkadot:confirming", "0x" + "22".repeat(32), now, now + 60_000],
    );

    const constraintCheck = await db.queryOne<{ consrc: string }>(
      `SELECT pg_get_constraintdef(oid) AS consrc
         FROM pg_constraint
        WHERE conname = 'payments_status_check'
          AND conrelid = 'payments'::regclass`,
    );
    expect(constraintCheck?.consrc).toBeDefined();
    const definition = constraintCheck?.consrc ?? "";
    for (const status of ["pending", "received", "settling", "confirming", "settled", "expired", "canceled", "failed"]) {
      expect(definition).toContain(`'${status}'`);
    }

    const seedRow = await db.queryOne<{ id: string }>(
      `SELECT id FROM "payments" WHERE status = 'received' LIMIT 1`,
    );
    if (seedRow) {
      await db.execute(`UPDATE "payments" SET status = 'confirming' WHERE id = $1`, [seedRow.id]);
      const afterUpdate = await db.queryOne<{ status: string }>(
        `SELECT status FROM "payments" WHERE id = $1`,
        [seedRow.id],
      );
      expect(afterUpdate?.status).toBe("confirming");

      let updateRejected = false;
      try {
        await db.execute(`UPDATE "payments" SET status = 'bogus_status' WHERE id = $1`, [seedRow.id]);
      } catch {
        updateRejected = true;
      }
      expect(updateRejected).toBe(true);

      let insertRejected = false;
      try {
        await db.execute(
          `INSERT INTO "payments" ("id","merchant_id","status","amount","topic_hex","deeplink","pubkey_hex","created_at","expires_at") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          ["pay_bogus", merchantId, "bogus_status", "1.00", "0x" + "11".repeat(32), "polkadot:bogus", "0x" + "22".repeat(32), Date.now(), Date.now() + 60_000],
        );
      } catch {
        insertRejected = true;
      }
      expect(insertRejected).toBe(true);
    }

    const indexCheck = await db.queryOne<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_payments_settlement'`,
    );
    expect(indexCheck?.indexdef).toBeDefined();
    expect(indexCheck?.indexdef ?? "").toContain("'received'");
    expect(indexCheck?.indexdef ?? "").toContain("'settling'");
    expect(indexCheck?.indexdef ?? "").toContain("'confirming'");

    await db.close();
  });
});