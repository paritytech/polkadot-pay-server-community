// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
});
