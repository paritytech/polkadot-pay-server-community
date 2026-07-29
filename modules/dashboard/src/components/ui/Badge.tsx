// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'error' | 'warning' | 'pending';

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-tertiary',
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  pending: 'bg-warning',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-nested px-2.5 py-0.5 text-xs font-medium text-secondary">
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
