// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
  action?: ToastAction;
}

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (input) => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      title: input.title,
      description: input.description,
      tone: input.tone ?? 'neutral',
      duration: input.duration ?? 5000,
      action: input.action,
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function toast(input: ToastInput): string {
  return useToastStore.getState().push(input);
}
