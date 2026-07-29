// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { z } from "zod";

import { resolveNetwork, SUPPORTED_NETWORKS, type NetworkConfig, type NetworkKey } from "./lib/networks";

export type EnvBindings = Record<string, never>;

function isValidMnemonic(value: string): boolean {
  try {
    mnemonicToEntropy(value);
    return true;
  } catch {
    return false;
  }
}

const mnemonicSchema = (name: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .transform((value) => value.trim())
      .refine(isValidMnemonic, `${name} must be a valid BIP39 phrase`)
      .optional(),
  );

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8788),
  BASE_URL: z.url(),
  DASHBOARD_URL: z.url().default("http://localhost:5175"),
  NETWORK: z.string().refine((value) => SUPPORTED_NETWORKS.includes(value as NetworkKey), `must be one of: ${SUPPORTED_NETWORKS.join(", ")}`).default("paseo-next-v2"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default("redis://redis:6379"),
  MASTER_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "MASTER_KEY must be 64 hex characters").transform((value) => value.toLowerCase()),
  SIGNUP_CODE: z.string().min(1, "SIGNUP_CODE must be a non-empty string"),
  OPERATOR_MNEMONIC: mnemonicSchema("OPERATOR_MNEMONIC"),
  SETTLEMENT_ACCOUNT_PATH: z.string().default(""),
  SETTLEMENT_POLL_MS: z.coerce.number().int().positive().default(20_000),
  SETTLEMENT_MAX_CLAIM_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PAYMENTS_V1_AUTH_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/, "PAYMENTS_V1_AUTH_KEY must be a 0x-prefixed 32-byte (64 hex character) ed25519 seed")
      .optional(),
  ),
});

export type Config = {
  port: number;
  baseUrl: string;
  dashboardUrl: string;
  network: NetworkConfig;
  peopleRpcUrl: string;
  databaseUrl: string;
  redisUrl: string;
  masterKey: Uint8Array;
  signupCode: string;
  operatorMnemonic?: string;
  settlement: { accountPath: string; pollMs: number; maxClaimAttempts: number };
  /** 32-byte ed25519 seed for the `AuthorizeValueTransfer` signed extension; undefined => Coinage value transfers fail with `System.CallFiltered`. */
  paymentsV1AuthKey?: Uint8Array;
};


function parseEnv(): Config {
  const parsed = envSchema.safeParse(Bun.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((issue) => `- ${issue.path.join(".") || "env"}: ${issue.message}`).join("\n")}`);
  }

  const env = parsed.data;
  const network = resolveNetwork(env.NETWORK);
  if (!network.peopleChain) {
    throw new Error(`Invalid environment:\n- NETWORK: selected network "${network.key}" has no People chain endpoint`);
  }
  return {
    port: env.PORT,
    baseUrl: env.BASE_URL.replace(/\/$/, ""),
    dashboardUrl: env.DASHBOARD_URL.replace(/\/$/, ""),
    network,
    peopleRpcUrl: network.peopleChain.wsUrl,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    masterKey: Uint8Array.from(env.MASTER_KEY.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16))),
    signupCode: env.SIGNUP_CODE,
    operatorMnemonic: env.OPERATOR_MNEMONIC,
    paymentsV1AuthKey: env.PAYMENTS_V1_AUTH_KEY
      ? Uint8Array.from(env.PAYMENTS_V1_AUTH_KEY.slice(2).match(/.{1,2}/g)!.map((byte: string) => Number.parseInt(byte, 16)))
      : undefined,
    settlement: { accountPath: env.SETTLEMENT_ACCOUNT_PATH, pollMs: env.SETTLEMENT_POLL_MS, maxClaimAttempts: env.SETTLEMENT_MAX_CLAIM_ATTEMPTS },
  };
}

export const config = parseEnv();
