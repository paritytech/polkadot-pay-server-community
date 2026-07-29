// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
const AMOUNT_RE = /^\d+\.\d{2}$/;

export function toCents(amount2dp: string): bigint {
  if (!AMOUNT_RE.test(amount2dp)) {
    throw new Error(`amount must match X.YY: ${JSON.stringify(amount2dp)}`);
  }
  const [units, cents] = amount2dp.split(".");
  return BigInt(units) * 100n + BigInt(cents);
}

export function fromCents(amount: bigint): string {
  const negative = amount < 0;
  const absolute = negative ? -amount : amount;
  const units = absolute / 100n;
  const cents = absolute % 100n;
  const prefix = negative ? "-" : "";
  return `${prefix}${units}.${cents.toString().padStart(2, "0")}`;
}
