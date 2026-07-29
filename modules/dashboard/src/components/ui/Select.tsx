// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { SelectHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'w-full rounded-nested border bg-surface-container px-3 py-2 text-sm text-primary',
        'cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}
