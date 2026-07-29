// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-surface-container rounded-container p-6 shadow-1', className)}
      {...props}
    />
  );
}
