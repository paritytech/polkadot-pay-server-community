// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type ISql, type Sql } from "postgres";

import { config } from "../env";

type QueryValue = string | number | boolean | null | bigint;

type QueryResult = { count: number };

export interface Database {
  query<T extends Record<string, unknown>>(statement: string, parameters?: QueryValue[]): Promise<T[]>;
  queryOne<T extends Record<string, unknown>>(statement: string, parameters?: QueryValue[]): Promise<T | null>;
  execute(statement: string, parameters?: QueryValue[]): Promise<QueryResult>;
  transaction<T>(run: (transaction: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));
const LOCK_NAMESPACE = "@parity/payment-processor-api:migrate";

function createDatabase(sql: ISql, root?: Sql): Database {
  return {
    async query<T extends Record<string, unknown>>(statement: string, parameters: QueryValue[] = []): Promise<T[]> {
      return await sql.unsafe(statement, parameters as never[]) as unknown as T[];
    },

    async queryOne<T extends Record<string, unknown>>(statement: string, parameters: QueryValue[] = []): Promise<T | null> {
      const rows = await sql.unsafe(statement, parameters as never[]) as unknown as T[];
      return rows[0] ?? null;
    },

    async execute(statement: string, parameters: QueryValue[] = []): Promise<QueryResult> {
      const result = await sql.unsafe(statement, parameters as never[]);
      return { count: result.count };
    },

    async transaction<T>(run: (transaction: Database) => Promise<T>): Promise<T> {
      if (!root) throw new Error("Nested database transactions are not supported");
      return await root.begin(async (transaction) => run(createDatabase(transaction))) as unknown as T;
    },

    async close(): Promise<void> {
      if (root) await root.end({ timeout: 5 });
    },
  };
}

function quoteSchema(schema: string): string {
  return `"${schema.replaceAll('"', '""')}"`;
}

function advisoryLockKey(schema: string): bigint {
  const digest = createHash("sha256").update(`${LOCK_NAMESPACE}\0${schema}`).digest();
  return digest.readBigInt64BE(0);
}

async function openApplicationClient(databaseUrl: string, targetSchema: string): Promise<{ root: Sql; db: Database }> {
  const root = postgres(databaseUrl, {
    connection: { search_path: quoteSchema(targetSchema) },
    types: {
      bigint: { ...postgres.BigInt, parse: Number },
    },
  });
  return { root, db: createDatabase(root, root) };
}

export async function openDatabase(databaseUrl = config.databaseUrl, schema?: string): Promise<Database> {
  const targetSchema = schema ?? "public";
  const migrationsRoot = postgres(databaseUrl, {
    connection: { search_path: quoteSchema(targetSchema) },
    max: 1,
  });
  let application: { root: Sql; db: Database } | undefined;
  let migrationsClosed = false;
  const closeMigrations = async () => {
    if (migrationsClosed) return;
    migrationsClosed = true;
    await migrationsRoot.end({ timeout: 5 }).catch(() => {});
  };
  try {
    const migrationsDb = createDatabase(migrationsRoot, migrationsRoot);
    const lockKey = advisoryLockKey(targetSchema);
    await migrationsDb.query(
      "SELECT pg_advisory_lock($1::bigint)",
      [lockKey.toString()],
    );
    try {
      const drizzleDb = drizzle(migrationsRoot);
      await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: targetSchema });
    } finally {
      await migrationsDb
        .execute("SELECT pg_advisory_unlock($1::bigint)", [lockKey.toString()])
        .catch(() => {});
      await closeMigrations();
    }
    application = await openApplicationClient(databaseUrl, targetSchema);
    return application.db;
  } catch (error) {
    if (application) {
      await application.root.end({ timeout: 5 }).catch(() => {});
    }
    await closeMigrations();
    throw error;
  }
}

export async function withTransaction<T>(db: Database, run: (transaction: Database) => Promise<T>): Promise<T> {
  return db.transaction(run);
}
