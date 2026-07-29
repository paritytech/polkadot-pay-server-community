// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function shortId(id: string, head = 10, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 3600],
  ['hour', 86400],
];

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const deltaSeconds = (then - Date.now()) / 1000;
  const magnitude = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
  for (const [unit, limit] of RELATIVE_UNITS) {
    if (magnitude < limit) {
      const divisor = limit === 60 ? 1 : limit === 3600 ? 60 : 3600;
      return formatter.format(Math.round(deltaSeconds / divisor), unit);
    }
  }
  return formatter.format(Math.round(deltaSeconds / 86400), 'day');
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const CURRENCY_DISPLAY: Record<string, string> = { CASH: 'USD' };

export function formatCurrency(currency: string): string {
  return CURRENCY_DISPLAY[currency] ?? currency;
}
