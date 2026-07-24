import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@cosmo/shared';
import {
  clearAuthFromExtension,
  syncAuthToExtension,
} from '../lib/extensionAuthBridge';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    user: User;
  }) => void;
  clearSession: () => void;
};

/** Prefer cosmo-auth; migrate once from legacy atlas-auth. */
const authStorage = createJSONStorage(() => {
  if (typeof window === 'undefined') return localStorage;
  try {
    if (!localStorage.getItem('cosmo-auth')) {
      const legacy = localStorage.getItem('atlas-auth');
      if (legacy) {
        localStorage.setItem('cosmo-auth', legacy);
        localStorage.removeItem('atlas-auth');
      }
    }
  } catch {
    /* ignore */
  }
  return localStorage;
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => {
        set({ accessToken, refreshToken, user });
        syncAuthToExtension({ accessToken, refreshToken });
      },
      clearSession: () => {
        set({ accessToken: null, refreshToken: null, user: null });
        clearAuthFromExtension();
      },
    }),
    {
      name: 'cosmo-auth',
      storage: authStorage,
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken && state?.refreshToken) {
          syncAuthToExtension({
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
          });
        }
      },
    }
  )
);
