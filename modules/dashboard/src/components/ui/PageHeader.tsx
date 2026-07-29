// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[2rem] leading-[1.15] text-primary">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-[68ch] text-sm leading-[1.55] text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
