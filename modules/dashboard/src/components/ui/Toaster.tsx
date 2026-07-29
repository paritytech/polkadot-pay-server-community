// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useToastStore, type Toast } from '../../stores/toastStore';
import { cn } from '../../lib/utils';

const TONE_DOT: Record<Toast['tone'], string> = {
  neutral: 'bg-tertiary',
  success: 'bg-success',
  error: 'bg-error',
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div className="flex w-80 items-start gap-3 rounded-nested bg-surface-container p-4 shadow-2">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 break-words text-sm text-secondary">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
            className="mt-2 text-sm font-medium text-link transition-colors hover:text-link-hover cursor-pointer"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(toast.id)}
        className="text-tertiary transition-colors hover:text-secondary cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastCard toast={toast} />
        </div>
      ))}
    </div>
  );
}
