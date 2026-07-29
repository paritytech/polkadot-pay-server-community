// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
interface KpiCardProps {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'default' | 'accent';
}

export function KpiCard({ label, value, detail, tone = 'default' }: KpiCardProps) {
  return (
    <article className={`relative overflow-hidden rounded-container bg-surface-container p-5 shadow-1 ${tone === 'accent' ? 'ring-1 ring-link' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{label}</p>
      <p className="mt-3 text-3xl font-semibold leading-none tabular-nums text-primary">{value}</p>
      <p className="mt-2 text-xs text-tertiary">{detail}</p>
    </article>
  );
}

export function KpiSkeleton() {
  return (
    <div className="animate-pulse rounded-container bg-surface-container p-5 shadow-1" aria-hidden>
      <div className="h-3 w-20 rounded bg-surface-nested" />
      <div className="mt-4 h-8 w-14 rounded bg-surface-nested" />
      <div className="mt-3 h-3 w-28 rounded bg-surface-nested" />
    </div>
  );
}
