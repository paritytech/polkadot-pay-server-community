// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";
import { DEV_PHRASE } from "@polkadot-labs/hdkd-helpers";

const backendDirectory = new URL("..", import.meta.url).pathname;
const requiredEnvironment = {
  BASE_URL: "http://localhost:8788",
  DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
  MASTER_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  NETWORK: "paseo-next-v2",
  SIGNUP_CODE: "environment-test-signup-code",
};

type LoadOptions = {
  environment?: Record<string, string>;
  /** Explicit list of environment keys to remove from the baseline. */
  unset?: ReadonlyArray<string>;
};

function loadConfig(options: LoadOptions = {}) {
  const env: Record<string, string | undefined> = { ...requiredEnvironment, ...(options.environment ?? {}) };
  for (const key of options.unset ?? []) delete env[key];
  return Bun.spawnSync({
    cmd: [process.execPath, "tests/helpers/load-config.ts"],
    cwd: backendDirectory,
    env: env as Record<string, string>,
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("environment mnemonic validation", () => {
  it("accepts a valid BIP39 operator mnemonic", () => {
    const result = loadConfig({ environment: { OPERATOR_MNEMONIC: DEV_PHRASE } });

    expect(result.exitCode).toBe(0);
  });

  it("rejects a malformed 12-word operator mnemonic during config loading", () => {
    const result = loadConfig({ environment: { OPERATOR_MNEMONIC: "one two three four five six seven eight nine ten eleven twelve" } });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("OPERATOR_MNEMONIC must be a valid BIP39 phrase");
  });
});

describe("environment PAYMENTS_V1_AUTH_KEY validation", () => {
  it("accepts a 0x-prefixed 32-byte ed25519 seed", () => {
    const result = loadConfig({
      environment: { PAYMENTS_V1_AUTH_KEY: "0x" + "07".repeat(32) },
    });

    expect(result.exitCode).toBe(0);
  });

  it("accepts an unset PAYMENTS_V1_AUTH_KEY (authorization disabled)", () => {
    const result = loadConfig({ unset: ["PAYMENTS_V1_AUTH_KEY"] });

    expect(result.exitCode).toBe(0);
  });

  it("rejects a PAYMENTS_V1_AUTH_KEY missing the 0x prefix", () => {
    const result = loadConfig({ environment: { PAYMENTS_V1_AUTH_KEY: "07".repeat(32) } });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("PAYMENTS_V1_AUTH_KEY must be a 0x-prefixed 32-byte");
  });

  it("rejects a PAYMENTS_V1_AUTH_KEY with the wrong byte length", () => {
    const result = loadConfig({ environment: { PAYMENTS_V1_AUTH_KEY: "0x" + "07".repeat(16) } });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("PAYMENTS_V1_AUTH_KEY must be a 0x-prefixed 32-byte");
  });
});

describe("environment SIGNUP_CODE validation", () => {
  it("accepts a non-empty SIGNUP_CODE", () => {
    const result = loadConfig({ environment: { SIGNUP_CODE: "open-merchants-2026" } });

    expect(result.exitCode).toBe(0);
  });

  it("rejects config loading when SIGNUP_CODE is missing", () => {
    const result = loadConfig({ unset: ["SIGNUP_CODE"] });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("SIGNUP_CODE");
  });

  it("rejects config loading when SIGNUP_CODE is the empty string", () => {
    const result = loadConfig({ environment: { SIGNUP_CODE: "" } });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("SIGNUP_CODE");
  });
});
