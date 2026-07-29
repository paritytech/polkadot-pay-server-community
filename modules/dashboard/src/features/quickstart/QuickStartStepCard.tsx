// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';
import { CodeBlock } from '../../components/ui';
import { cn } from '../../lib/utils';

interface QuickStartStepCardProps {
  index: number;
  done: boolean;
  onToggle: () => void;
  title: string;
  description: ReactNode;
  code: string;
  controls?: ReactNode;
  footer?: ReactNode;
}

const MARK = 'grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] text-sm font-medium transition-colors';

export function QuickStartStepCard({
  index,
  done,
  onToggle,
  title,
  description,
  code,
  controls,
  footer,
}: QuickStartStepCardProps) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-4 rounded-container bg-surface-container p-6 shadow-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? `Mark step ${index} as not done` : `Mark step ${index} as done`}
        className={cn(
          MARK,
          done ? 'border-success bg-success text-static-white' : 'border-indicator text-secondary hover:border-secondary',
        )}
      >
        {done ? '✓' : index}
      </button>
      <div className="grid min-w-0 gap-4">
        <div>
          <h3 className="text-lg font-semibold leading-tight text-primary">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary text-pretty">{description}</p>
        </div>
        {controls}
        {code ? <CodeBlock code={code} /> : null}
        {footer}
      </div>
    </div>
  );
}