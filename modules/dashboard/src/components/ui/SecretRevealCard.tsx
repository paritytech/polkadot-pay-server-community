// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Button } from './Button';
import { CodeBlock } from './CodeBlock';

interface SecretRevealCardProps {
  title: string;
  description: string;
  label: string;
  secret: string;
  dismissLabel?: string;
  onDismiss: () => void;
}

/** One-time secret surface: shown once at creation, never retrievable later. */
export function SecretRevealCard({
  title,
  description,
  label,
  secret,
  dismissLabel = 'I saved it',
  onDismiss,
}: SecretRevealCardProps) {
  return (
    <div className="grid gap-4 rounded-container bg-surface-container p-6 shadow-2">
      <div>
        <h3 className="text-lg font-semibold leading-tight text-primary">{title}</h3>
        <p className="mt-1.5 text-sm text-secondary">{description}</p>
      </div>
      <CodeBlock code={secret} label={label} />
      <Button variant="secondary" className="justify-self-start" onClick={onDismiss}>
        {dismissLabel}
      </Button>
    </div>
  );
}
