// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import "./test-env.ts";

import { afterAll, afterEach } from "bun:test";
import { buildFixture, bytesToHex, hexToBytes } from "../encrypt-fixture.ts";
import { createApiKeyRecord, createMerchantRecord } from "../../src/modules/accounts/accounts.repo.ts";
import { sha256Hex } from "../../src/lib/crypto.ts";
import { openDatabase, type Database } from "../../src/db/client.ts";
import { apiKeyId, merchantId } from "../../src/lib/ids.ts";
import type { MerchantRecord } from "../../src/types.ts";

const schemas: string[] = [];
const databases: Database[] = [];

async function cleanupTestDatabases(): Promise<void> {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) return;
  const admin = await openDatabase(databaseUrl);
  try {
    for (const schema of schemas.splice(0)) await admin.execute(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await admin.close();
  }
}

afterEach(cleanupTestDatabases);
afterAll(cleanupTestDatabases);

export async function createTestDatabase(label: string): Promise<Database> {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  const schema = `pp_${label.replaceAll(/[^a-zA-Z0-9_]/g, "_").slice(0, 20)}_${crypto.randomUUID().replaceAll("-", "")}`.toLowerCase();
  const admin = await openDatabase(databaseUrl);
  try {
    await admin.execute(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.close();
  }
  schemas.push(schema);
  const database = await openDatabase(databaseUrl, schema);
  databases.push(database);
  return database;
}

export async function seedMerchantWithKey(db: Database, name = "Test Merchant"): Promise<{ merchant: MerchantRecord; secret: string; apiKeyId: string }> {
  const now = Date.now();
  const merchant = { id: merchantId(), name, created_at: now };
  const secret = `payment_processor_sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url")}`;
  const keyId = apiKeyId();
  await createMerchantRecord(db, merchant);
  await createApiKeyRecord(db, { id: keyId, merchant_id: merchant.id, key_hash: sha256Hex(secret), last4: secret.slice(-4), label: "test", created_at: now, revoked_at: null });
  return { merchant, secret, apiKeyId: keyId };
}

function compactEncode(value: number): string {
  if (value < 64) return (value << 2).toString(16).padStart(2, "0");
  if (value < 1 << 14) {
    return [((value & 0b00111111) << 2) | 0b01, value >> 6].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("value too large for compact encoding");
}

export function buildStatementHex(input: {
  paymentId: string; paymentPubkeyHex: string; amount: string; coinFill?: number; payloadId?: string;
}): string {
  const envelope = buildFixture({
    merchantPubCompressed: hexToBytes(input.paymentPubkeyHex),
    ephemeralPriv: new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1)),
    iv: new Uint8Array(Array.from({ length: 12 }, (_, index) => 160 + index)),
    payload: { amount: input.amount, timestamp: 1770000000000n, coins: [new Uint8Array(64).fill(input.coinFill ?? 7)], id: input.payloadId ?? input.paymentId },
  }).envelopeBytes;
  return `0x${[compactEncode(5), "00", "00", "00".repeat(64), "00".repeat(32), "02", "00".repeat(8), "03", "00".repeat(32), "04", "00".repeat(32), "08", compactEncode(envelope.length), bytesToHex(envelope)].join("")}`;
}
