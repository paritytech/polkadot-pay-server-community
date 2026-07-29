// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createApiKeyRecord, createMerchantRecord } from "../src/modules/accounts/accounts.repo.ts";
import { sha256Hex } from "../src/lib/crypto.ts";
import { apiKeyId, merchantId } from "../src/lib/ids.ts";
import { openDatabase, withTransaction } from "../src/db/client.ts";

type Command = { name: "create-merchant"; merchantName: string; label: string | null };

function usage(): string {
  return `Usage:
  bun run cli create-merchant --name <name> [--label <label>]`;
}

function fail(message: string): never {
  throw new Error(`${message}\n\n${usage()}`);
}

function parseOptions(args: string[]): Map<string, string | true> {
  const options = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);

    const name = arg.slice(2);
    if (!name) fail("Invalid option");
    if (options.has(name)) fail(`Option --${name} was provided more than once`);

    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`Option --${name} requires a value`);
    options.set(name, value);
    index += 1;
  }

  return options;
}

function stringOption(options: Map<string, string | true>, name: string): string | null {
  const value = options.get(name);
  if (value === undefined) return null;
  if (value === true) fail(`Option --${name} requires a value`);
  return value;
}

function assertOnly(options: Map<string, string | true>, allowed: string[]): void {
  for (const name of options.keys()) {
    if (!allowed.includes(name)) fail(`Unknown option: --${name}`);
  }
}

function parseCommand(args: string[]): Command {
  const [commandName, ...commandArgs] = args;
  if (!commandName || commandName === "--help" || commandName === "-h" || commandName === "help") {
    throw new Error(usage());
  }

  const options = parseOptions(commandArgs);
  switch (commandName) {
    case "create-merchant": {
      assertOnly(options, ["name", "label"]);
      const merchantName = stringOption(options, "name")?.trim();
      if (!merchantName) fail("Option --name must be a non-empty value");
      const label = stringOption(options, "label")?.trim() ?? null;
      if (label === "") fail("Option --label must be a non-empty value");
      return { name: commandName, merchantName, label };
    }
    default:
      fail(`Unknown command: ${commandName}`);
  }
}

function generateApiKeySecret(): string {
  return `payment_processor_sk_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
}

async function createMerchant(name: string, label: string | null): Promise<void> {
  const db = await openDatabase();
  try {
    const now = Date.now();
    const merchant = { id: merchantId(), name, created_at: now };
    const secret = generateApiKeySecret();
    const apiKey = {
      id: apiKeyId(),
      merchant_id: merchant.id,
      key_hash: sha256Hex(secret),
      last4: secret.slice(-4),
      label,
      created_at: now,
      revoked_at: null,
    };

    await withTransaction(db, async (transaction) => {
      await createMerchantRecord(transaction, merchant);
      await createApiKeyRecord(transaction, apiKey);
    });

    console.log(JSON.stringify({
      merchant: { id: merchant.id, name: merchant.name },
      api_key: { id: apiKey.id, secret, last4: apiKey.last4, label: apiKey.label },
    }));
  } finally {
    await db.close();
  }
}

async function main(): Promise<void> {
  const command = parseCommand(Bun.argv.slice(2));
  switch (command.name) {
    case "create-merchant":
      await createMerchant(command.merchantName, command.label);
      return;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
