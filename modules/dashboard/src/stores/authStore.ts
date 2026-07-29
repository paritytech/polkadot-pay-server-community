// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { create } from 'zustand';

const STORAGE_KEY = 'ppapi_api_key';

interface AuthState {
  apiKey: string | null;
  isSignedIn: boolean;
  signIn: (apiKey: string) => void;
  signOut: () => void;
}

function readStoredKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  apiKey: readStoredKey(),
  isSignedIn: Boolean(readStoredKey()),
  signIn: (apiKey) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, apiKey);
    } catch {
      /* sessionStorage unavailable; session stays in memory only */
    }
    set({ apiKey, isSignedIn: true });
  },
  signOut: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sessionStorage unavailable */
    }
    set({ apiKey: null, isSignedIn: false });
  },
}));
