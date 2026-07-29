// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { create } from 'zustand';

/** The five Quick Start steps from Dashboard.dc.html, checked off by the operator. */
export const QUICK_START_STEPS = 5;

const STORAGE_KEY = 'ppapi_quick_start_done';

interface QuickStartState {
  done: Record<number, boolean>;
  toggle: (step: number) => void;
}

function readStored(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const done: Record<number, boolean> = {};
    for (const step of parsed) {
      if (typeof step === 'number' && step >= 1 && step <= QUICK_START_STEPS) done[step] = true;
    }
    return done;
  } catch {
    return {};
  }
}

export const useQuickStartStore = create<QuickStartState>((set, get) => ({
  done: readStored(),
  toggle: (step) => {
    const done = { ...get().done, [step]: !get().done[step] };
    try {
      const finished = Object.keys(done)
        .map(Number)
        .filter((key) => done[key]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(finished));
    } catch {
      /* localStorage unavailable; progress stays in memory only */
    }
    set({ done });
  },
}));

/** Stable selector so the rail label and the page progress bar stay in lockstep. */
export const selectQuickStartDone = (state: QuickStartState): number =>
  Object.values(state.done).filter(Boolean).length;

export function useQuickStartCount(): number {
  return useQuickStartStore(selectQuickStartDone);
}
