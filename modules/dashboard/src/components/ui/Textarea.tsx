// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { TextareaHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'w-full min-h-[80px] resize-y rounded-nested border bg-surface-container px-3 py-2',
        'text-sm text-primary placeholder:text-tertiary cursor-text transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}
