// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('w-5 h-5 animate-spin text-tertiary', className)} aria-hidden />;
}
