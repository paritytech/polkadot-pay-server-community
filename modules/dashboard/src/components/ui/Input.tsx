// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

const CONTROL =
  'w-full rounded-nested border bg-surface-container px-3 py-2 text-sm text-primary ' +
  'placeholder:text-tertiary transition-colors cursor-text ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      className={cn(CONTROL, invalid && 'border-error', className)}
      style={invalid ? { outlineColor: 'var(--focus-error)' } : undefined}
      {...props}
    />
  );
}
