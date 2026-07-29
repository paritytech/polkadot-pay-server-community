// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-container bg-surface-nested p-12 text-center">
      <div className="mb-4 rounded-full bg-surface-container p-4">
        <Icon className="h-6 w-6 text-tertiary" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold leading-tight text-primary">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-secondary">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
