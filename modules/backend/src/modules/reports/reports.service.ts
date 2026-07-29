// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { fromCents, toCents } from "../../lib/money";
import type { Database } from "../../db/client";

import { getReportVolumeTotal, listReportVolumeRows } from "./reports.repo";

export type ReportsVolumeInterval = "day" | "hour" | "total";

export type ReportsVolumeQuery = {
  from?: string;
  to?: string;
  interval?: ReportsVolumeInterval;
};

export type ReportsVolumeBucket = {
  start: string;
  count: number;
  amount: string;
};

export type ReportsVolumeResponse = {
  object: "report.volume";
  buckets: ReportsVolumeBucket[];
  total: {
    count: number;
    amount: string;
  };
};

type VolumeBucket = {
  start: string;
  count: number;
  cents: bigint;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const EPOCH_ISO = new Date(0).toISOString();

function bucketStart(timestampMs: number, interval: "day" | "hour"): string {
  const date = new Date(timestampMs);
  if (interval === "hour") {
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function getReportVolume(db: Database, merchantId: string, query: ReportsVolumeQuery): Promise<ReportsVolumeResponse> {
  const interval = query.interval ?? "day";
  const now = Date.now();
  const from = query.from ? Date.parse(query.from) : now - THIRTY_DAYS_MS;
  const to = query.to ? Date.parse(query.to) : now;

  if (interval === "total") {
    const row = await getReportVolumeTotal(db, merchantId, from, to);
    const count = Number(row?.count ?? 0);
    const amount = fromCents(BigInt(row?.cents ?? "0"));
    return {
      object: "report.volume",
      buckets: count === 0 ? [] : [{ start: EPOCH_ISO, count, amount }],
      total: { count, amount },
    };
  }

  const rows = await listReportVolumeRows(db, merchantId, from, to);
  const buckets = new Map<string, VolumeBucket>();
  let totalCount = 0;
  let totalCents = 0n;

  for (const row of rows) {
    totalCount += 1;
    const cents = toCents(row.amount);
    totalCents += cents;
    const start = bucketStart(row.received_at, interval);
    const current = buckets.get(start) ?? { start, count: 0, cents: 0n };
    current.count += 1;
    current.cents += cents;
    buckets.set(start, current);
  }

  return {
    object: "report.volume",
    buckets: [...buckets.values()].map((bucket) => ({
      start: bucket.start,
      count: bucket.count,
      amount: fromCents(bucket.cents),
    })),
    total: {
      count: totalCount,
      amount: fromCents(totalCents),
    },
  };
}
