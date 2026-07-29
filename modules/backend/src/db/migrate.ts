// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { openDatabase } from "./client";

const schema = process.env.DATABASE_SCHEMA;

const db = await openDatabase(undefined, schema);
await db.close();
