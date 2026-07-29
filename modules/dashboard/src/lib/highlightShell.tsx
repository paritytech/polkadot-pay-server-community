// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { ReactNode } from 'react';

const COMMANDS: Record<string, true> = { curl: true, export: true, echo: true };

const VARIABLE_RE = /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g;

/** Splits string/comment body text on `$VAR` / `${VAR}` so variables get their own color. */
function renderWithVariables(text: string, baseClassName: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  VARIABLE_RE.lastIndex = 0;
  while ((match = VARIABLE_RE.exec(text))) {
    if (match.index > last) {
      nodes.push(
        <span key={`${keyPrefix}-t${i++}`} className={baseClassName}>
          {text.slice(last, match.index)}
        </span>,
      );
    }
    nodes.push(
      <span key={`${keyPrefix}-v${i++}`} className="text-fuchsia-300">
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(
      <span key={`${keyPrefix}-t${i++}`} className={baseClassName}>
        {text.slice(last)}
      </span>,
    );
  }
  return nodes;
}

const TOKEN_RE = /(#.*)|("(?:\\.|[^"\\])*")|('(?:[^'])*')|(\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)|(--[A-Za-z][\w-]*|-[A-Za-z])|\b(curl|export|echo)\b/g;

/**
 * Lightweight shell/curl syntax highlighter for terminal code blocks — no external
 * dependency, tokenizes commands, flags, quoted strings, comments, and `$VAR` refs.
 * Renders to ReactNode; does not alter the underlying text content.
 */
export function highlightShell(code: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(code))) {
    if (match.index > last) {
      nodes.push(code.slice(last, match.index));
    }
    const [full, comment, dquote, squote, variable, flag, command] = match;
    if (comment) {
      nodes.push(
        <span key={key++} className="italic text-terminal-fg-muted">
          {comment}
        </span>,
      );
    } else if (dquote) {
      nodes.push(...renderWithVariables(dquote, 'text-emerald-300', `s${key++}`));
    } else if (squote) {
      nodes.push(
        <span key={key++} className="text-emerald-300">
          {squote}
        </span>,
      );
    } else if (variable) {
      nodes.push(
        <span key={key++} className="text-fuchsia-300">
          {variable}
        </span>,
      );
    } else if (flag) {
      nodes.push(
        <span key={key++} className="text-amber-300">
          {flag}
        </span>,
      );
    } else if (command && COMMANDS[command]) {
      nodes.push(
        <span key={key++} className="font-semibold text-sky-400">
          {command}
        </span>,
      );
    } else {
      nodes.push(full);
    }
    last = match.index + full.length;
  }
  if (last < code.length) {
    nodes.push(code.slice(last));
  }
  return nodes;
}
