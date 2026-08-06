import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@cosmo/shared';
import {
  clearAuthFromExtension,
  syncAuthToExtension,
} from '../lib/extensionAuthBridge';

type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type StashedAdminSession = {
  accessToken: string;
  refreshToken: string | null;
  user: User;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  /** True while an admin is proxy-logged into a user dashboard. */
  impersonating: boolean;
  setSession: (payload: SessionPayload) => void;
  clearSession: () => void;
  startImpersonation: (payload: {
    accessToken: string;
    user: User;
  }) => void;
  endImpersonation: () => boolean;
};

const ADMIN_STASH_KEY = 'cosmo-admin-session-stash';

function stashAdminSession(session: StashedAdminSession): void {
  try {
    sessionStorage.setItem(ADMIN_STASH_KEY, JSON.stringify(session));
  } catch {
    /* ignore quota / private mode */
  }
}

function readAdminStash(): StashedAdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StashedAdminSession;
    if (!parsed?.accessToken || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearAdminStash(): void {
  try {
    sessionStorage.removeItem(ADMIN_STASH_KEY);
  } catch {
    /* ignore */
  }
}

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
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      impersonating: false,
      setSession: ({ accessToken, refreshToken, user }) => {
        set({ accessToken, refreshToken, user, impersonating: false });
        clearAdminStash();
        syncAuthToExtension({ accessToken, refreshToken });
      },
      clearSession: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          impersonating: false,
        });
        clearAdminStash();
        clearAuthFromExtension();
      },
      startImpersonation: ({ accessToken, user }) => {
        const current = get();
        if (current.accessToken && current.user) {
          stashAdminSession({
            accessToken: current.accessToken,
            refreshToken: current.refreshToken,
            user: current.user,
          });
        }
        // Do not push user tokens to the extension — admin browser stays unlinked.
        clearAuthFromExtension();
        set({
          accessToken,
          refreshToken: null,
          user,
          impersonating: true,
        });
      },
      endImpersonation: () => {
        const stash = readAdminStash();
        clearAdminStash();
        if (!stash) {
          set({
            accessToken: null,
            refreshToken: null,
            user: null,
            impersonating: false,
          });
          clearAuthFromExtension();
          return false;
        }
        set({
          accessToken: stash.accessToken,
          refreshToken: stash.refreshToken,
          user: stash.user,
          impersonating: false,
        });
        if (stash.refreshToken) {
          syncAuthToExtension({
            accessToken: stash.accessToken,
            refreshToken: stash.refreshToken,
          });
        } else {
          clearAuthFromExtension();
        }
        return true;
      },
    }),
    {
      name: 'cosmo-auth',
      storage: authStorage,
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        impersonating: state.impersonating,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.impersonating) {
          clearAuthFromExtension();
          return;
        }
        if (state.accessToken && state.refreshToken) {
          syncAuthToExtension({
            accessToken: state.accessToken,
            refreshToken: state.refreshToken,
          });
        }
      },
    }
  )
);
