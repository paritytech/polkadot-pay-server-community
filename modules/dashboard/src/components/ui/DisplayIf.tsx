// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';

type Props = { children: ReactNode } & (
  | { when: unknown; falsy?: never }
  | { falsy: unknown; when?: never }
);

export function DisplayIf({ when, falsy, children }: Props) {
  if (when !== undefined) return when ? <>{children}</> : null;
  return falsy ? null : <>{children}</>;
}
