// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';
import { useId } from 'react';
import { DisplayIf } from './DisplayIf';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-primary">
        {label}
      </label>
      {children(id)}
      <DisplayIf when={hint && !error}>
        <p className="text-sm text-tertiary">{hint}</p>
      </DisplayIf>
      <DisplayIf when={error}>
        <p className="text-sm text-error">{error}</p>
      </DisplayIf>
    </div>
  );
}
