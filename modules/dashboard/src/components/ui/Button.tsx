// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action-primary text-primary-inverted hover:bg-action-primary-hover',
  secondary: 'bg-action-secondary text-primary hover:bg-action-secondary-hover',
  ghost: 'bg-transparent text-primary hover:bg-action-secondary-hover',
  danger: 'bg-status-error text-primary-inverted hover:bg-status-error-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-small font-medium transition-colors',
        VARIANTS[variant],
        SIZES[size],
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}
