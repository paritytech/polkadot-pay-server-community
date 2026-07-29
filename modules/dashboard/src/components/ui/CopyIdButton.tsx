// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Check, Copy } from 'lucide-react';
import { useCopy } from '../../hooks/useCopy';
import { cn } from '../../lib/utils';
import { DisplayIf } from './DisplayIf';

type CopyIdSize = 'sm' | 'md';

interface CopyIdButtonProps {
  value: string;
  label?: string;
  size?: CopyIdSize;
}

/** Icon-only id copier plus the inline "Copied" acknowledgement the mockup shows beside it. */
const PADDING: Record<CopyIdSize, string> = {
  sm: 'px-[5px] py-[3px]',
  md: 'px-[7px] py-[5px]',
};

const ICON: Record<CopyIdSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
};

export function CopyIdButton({ value, label = 'Copy ID', size = 'md' }: CopyIdButtonProps) {
  const { copied, copy } = useCopy(1800);
  const Icon = copied ? Check : Copy;
  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => copy(value)}
        className={cn(
          'inline-flex shrink-0 cursor-pointer rounded-small bg-action-secondary text-primary',
          'transition-colors hover:bg-action-secondary-hover',
          PADDING[size],
        )}
      >
        <Icon className={ICON[size]} aria-hidden />
      </button>
      <DisplayIf when={copied}>
        <span className="whitespace-nowrap text-xs text-success" role="status">
          Copied
        </span>
      </DisplayIf>
    </>
  );
}
