import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@atlas/shared';
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
    { name: 'atlas-auth' }
  )
);
