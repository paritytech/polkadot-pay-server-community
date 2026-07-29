// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Database } from "../../db/client";

export type ReportVolumeRow = {
  amount: string;
  received_at: number;
};

export type ReportVolumeTotalRow = {
  count: number | string;
  cents: string;
};

export async function listReportVolumeRows(db: Database, merchantId: string, from: number, to: number): Promise<ReportVolumeRow[]> {
  return db.query<ReportVolumeRow>(
    `SELECT amount, received_at
     FROM payments
     WHERE merchant_id = $1 AND received_at IS NOT NULL
       AND received_at >= $2 AND received_at <= $3
     ORDER BY received_at ASC`,
    [merchantId, from, to],
  );
}

export async function getReportVolumeTotal(
  db: Database,
  merchantId: string,
  from: number,
  to: number,
): Promise<ReportVolumeTotalRow | null> {
  return db.queryOne<ReportVolumeTotalRow>(
    `SELECT
       COUNT(*) AS count,
       COALESCE(SUM((amount::numeric * 100)::bigint), 0)::text AS cents
     FROM payments
     WHERE merchant_id = $1 AND received_at IS NOT NULL
       AND received_at >= $2 AND received_at <= $3`,
    [merchantId, from, to],
  );
}
