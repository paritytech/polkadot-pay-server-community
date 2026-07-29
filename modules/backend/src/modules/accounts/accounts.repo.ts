// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ApiKeyRecord, AuthenticatedMerchant, MerchantRecord } from "../../types.ts";
import type { Database } from "../../db/client.ts";

const findActiveApiKeyQuery = `
  SELECT
    m.id,
    m.name,
    m.created_at,
    ak.id AS api_key_id,
    ak.merchant_id,
    ak.key_hash,
    ak.last4,
    ak.label,
    ak.created_at AS api_key_created_at,
    ak.revoked_at
  FROM api_keys ak
  JOIN merchants m ON m.id = ak.merchant_id
  WHERE ak.key_hash = $1 AND ak.revoked_at IS NULL
  LIMIT 1
`;

export async function findAuthenticatedMerchantByKeyHash(
  db: Database,
  keyHash: string,
): Promise<AuthenticatedMerchant | null> {
  const row = await db.queryOne<{
    id: string;
    name: string;
    created_at: number;
    api_key_id: string;
    merchant_id: string;
    key_hash: string;
    last4: string;
    label: string | null;
    api_key_created_at: number;
    revoked_at: number | null;
  }>(findActiveApiKeyQuery, [keyHash]);

  if (!row) {
    return null;
  }

  return {
    merchant: {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
    },
    apiKey: {
      id: row.api_key_id,
      merchant_id: row.merchant_id,
      key_hash: row.key_hash,
      last4: row.last4,
      label: row.label,
      created_at: row.api_key_created_at,
      revoked_at: row.revoked_at,
    },
  };
}

export async function createMerchantRecord(
  db: Database,
  merchant: MerchantRecord,
): Promise<void> {
  await db.execute(
    "INSERT INTO merchants (id, name, created_at) VALUES ($1, $2, $3)",
    [merchant.id, merchant.name, merchant.created_at],
  );
}

export async function getMerchant(
  db: Database,
  merchantId: string,
): Promise<MerchantRecord | null> {
  const merchant = await db.queryOne<MerchantRecord>(
    "SELECT id, name, created_at FROM merchants WHERE id = $1 LIMIT 1",
    [merchantId],
  );
  return merchant;
}

export async function updateMerchantName(db: Database, merchantId: string, name: string): Promise<void> {
  await db.execute("UPDATE merchants SET name = $2 WHERE id = $1", [merchantId, name]);
}

export async function createApiKeyRecord(
  db: Database,
  apiKey: ApiKeyRecord,
): Promise<void> {
  await db.execute(
    `INSERT INTO api_keys (id, merchant_id, key_hash, last4, label, created_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      apiKey.id,
      apiKey.merchant_id,
      apiKey.key_hash,
      apiKey.last4,
      apiKey.label,
      apiKey.created_at,
      apiKey.revoked_at,
    ],
  );
}

export async function listApiKeys(
  db: Database,
  merchantId: string,
): Promise<ApiKeyRecord[]> {
  return await db.query<ApiKeyRecord>(
    `SELECT
       id,
       merchant_id,
       key_hash,
       last4,
       label,
       created_at,
       revoked_at
     FROM api_keys
     WHERE merchant_id = $1
     ORDER BY created_at DESC`,
    [merchantId],
  );
}

export async function findApiKey(
  db: Database,
  merchantId: string,
  apiKeyId: string,
): Promise<ApiKeyRecord | null> {
  const apiKey = await db.queryOne<ApiKeyRecord>(
    `SELECT
       id,
       merchant_id,
       key_hash,
       last4,
       label,
       created_at,
       revoked_at
     FROM api_keys
     WHERE merchant_id = $1 AND id = $2
     LIMIT 1`,
    [merchantId, apiKeyId],
  );
  return apiKey;
}

export async function countActiveApiKeys(db: Database, merchantId: string): Promise<number> {
  const row = await db.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM api_keys WHERE merchant_id = $1 AND revoked_at IS NULL",
    [merchantId],
  );
  return Number(row?.count ?? 0);
}

export async function revokeApiKey(
  db: Database,
  merchantId: string,
  apiKeyId: string,
  revokedAt: number,
): Promise<void> {
  await db.execute("UPDATE api_keys SET revoked_at = $3 WHERE merchant_id = $1 AND id = $2", [
    merchantId,
    apiKeyId,
    revokedAt,
  ]);
}
