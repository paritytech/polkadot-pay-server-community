// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Check, Copy } from 'lucide-react';
import { useCopy } from '../../hooks/useCopy';
import { cn } from '../../lib/utils';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = 'Copy', className }: CopyButtonProps) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-small bg-action-secondary px-3 py-1.5',
        'text-sm font-medium text-primary transition-colors hover:bg-action-secondary-hover cursor-pointer',
        className,
      )}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
