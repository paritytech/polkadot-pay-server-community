// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { appError } from "../../lib/errors.ts";
import { apiKeyId, merchantId } from "../../lib/ids.ts";
import { sha256Hex } from "../../lib/crypto.ts";
import { withTransaction, type Database } from "../../db/client.ts";
import {
  countActiveApiKeys,
  createApiKeyRecord,
  createMerchantRecord,
  findApiKey,
  getMerchant,
  listApiKeys as listApiKeyRecords,
  revokeApiKey as revokeApiKeyRecord,
  updateMerchantName,
} from "./accounts.repo.ts";

export type MerchantResponse = {
  id: string;
  name: string;
  created_at: string;
};

export type ApiKeyResponse = {
  id: string;
  object: "api_key";
  label: string | null;
  last4: string;
  created_at: string;
  revoked_at: string | null;
};

export type ApiKeySecretResponse = ApiKeyResponse & {
  secret: string;
};

export type SignupResponse = {
  account: MerchantResponse;
  api_key: ApiKeySecretResponse;
};

export type ApiKeysListResponse = {
  object: "list";
  data: ApiKeyResponse[];
  has_more: false;
};

export async function createAccount(
  db: Database,
  input: { name: string; signupCode: string; expectedSignupCode: string },
): Promise<SignupResponse> {
  if (input.signupCode !== input.expectedSignupCode) {
    throw appError(
      403,
      "authentication_error",
      "invalid_signup_code",
      "Signup code is invalid.",
      "signup_code",
    );
  }

  const secret = `payment_processor_sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
  const now = Date.now();
  const merchant = { id: merchantId(), name: input.name, created_at: now };
  const apiKey = {
    id: apiKeyId(),
    merchant_id: merchant.id,
    key_hash: sha256Hex(secret),
    last4: secret.slice(-4),
    label: null,
    created_at: now,
    revoked_at: null,
  };

  await withTransaction(db, async (transaction) => {
    await createMerchantRecord(transaction, merchant);
    await createApiKeyRecord(transaction, apiKey);
  });

  return {
    account: {
      id: merchant.id,
      name: merchant.name,
      created_at: new Date(merchant.created_at).toISOString(),
    },
    api_key: {
      id: apiKey.id,
      object: "api_key",
      label: apiKey.label,
      last4: apiKey.last4,
      created_at: new Date(apiKey.created_at).toISOString(),
      revoked_at: null,
      secret,
    },
  };
}

export async function getAccount(db: Database, merchantIdValue: string): Promise<MerchantResponse> {
  const merchant = await getMerchant(db, merchantIdValue);
  if (!merchant) {
    throw appError(404, "not_found_error", "account_not_found", "Account not found.");
  }

  return {
    id: merchant.id,
    name: merchant.name,
    created_at: new Date(merchant.created_at).toISOString(),
  };
}

export async function updateAccount(
  db: Database,
  input: { merchantId: string; name: string },
): Promise<MerchantResponse> {
  await updateMerchantName(db, input.merchantId, input.name);
  const merchant = await getMerchant(db, input.merchantId);
  if (!merchant) {
    throw appError(404, "not_found_error", "account_not_found", "Account not found.");
  }

  return {
    id: merchant.id,
    name: merchant.name,
    created_at: new Date(merchant.created_at).toISOString(),
  };
}

export async function createApiKey(
  db: Database,
  input: { merchantId: string; label: string | null },
): Promise<ApiKeySecretResponse> {
  const secret = `payment_processor_sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
  const apiKey = {
    id: apiKeyId(),
    merchant_id: input.merchantId,
    key_hash: sha256Hex(secret),
    last4: secret.slice(-4),
    label: input.label,
    created_at: Date.now(),
    revoked_at: null,
  };

  await createApiKeyRecord(db, apiKey);
  return {
    id: apiKey.id,
    object: "api_key",
    label: apiKey.label,
    last4: apiKey.last4,
    created_at: new Date(apiKey.created_at).toISOString(),
    revoked_at: null,
    secret,
  };
}

export async function listApiKeys(db: Database, merchantIdValue: string): Promise<ApiKeysListResponse> {
  const keys = await listApiKeyRecords(db, merchantIdValue);
  const data: ApiKeyResponse[] = [];
  for (const key of keys) {
    data.push({
      id: key.id,
      object: "api_key",
      label: key.label,
      last4: key.last4,
      created_at: new Date(key.created_at).toISOString(),
      revoked_at: key.revoked_at ? new Date(key.revoked_at).toISOString() : null,
    });
  }
  return { object: "list", data, has_more: false };
}

export async function revokeApiKey(
  db: Database,
  input: { merchantId: string; apiKeyId: string },
): Promise<void> {
  const key = await findApiKey(db, input.merchantId, input.apiKeyId);
  if (!key) {
    throw appError(404, "not_found_error", "api_key_not_found", "API key not found.");
  }
  if ((await countActiveApiKeys(db, input.merchantId)) <= 1 && key.revoked_at === null) {
    throw appError(400, "invalid_request_error", "last_active_key", "Cannot revoke the last active API key.");
  }
  await revokeApiKeyRecord(db, input.merchantId, input.apiKeyId, Date.now());
}
