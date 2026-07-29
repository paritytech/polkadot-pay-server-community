// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Check, Copy } from 'lucide-react';
import { useCopy } from '../../hooks/useCopy';
import { highlightShell } from '../../lib/highlightShell';

interface CodeBlockProps {
  code: string;
  label?: string;
  truncate?: boolean;
}

export function CodeBlock({ code, label, truncate }: CodeBlockProps) {
  const { copied, copy } = useCopy();
  return (
    <div className="overflow-hidden rounded-nested bg-terminal">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-terminal-fg-muted">
          {label ?? 'Terminal'}
        </span>
        <button
          type="button"
          onClick={() => copy(code)}
          className="inline-flex items-center gap-1.5 rounded-full bg-terminal-action px-3 py-1.5 text-sm font-medium text-terminal-fg transition-colors hover:bg-terminal-action-hover cursor-pointer"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className={
          truncate
            ? 'truncate px-4 pb-4 pt-3 text-sm leading-relaxed text-terminal-fg'
            : 'overflow-x-auto px-4 pb-4 pt-3 text-sm leading-relaxed text-terminal-fg'
        }
      >
        <code className="font-mono" title={truncate ? code : undefined}>
          {highlightShell(code)}
        </code>
      </pre>
    </div>
  );
}
