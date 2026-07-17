const DEFAULT_API = 'http://localhost:4000';

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl: string;
};

const KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  apiBaseUrl: 'apiBaseUrl',
  queue: 'eventQueue',
} as const;

export async function getAuthState(): Promise<AuthState> {
  const data = await chrome.storage.local.get([
    KEYS.accessToken,
    KEYS.refreshToken,
    KEYS.apiBaseUrl,
  ]);
  return {
    accessToken: (data[KEYS.accessToken] as string) ?? null,
    refreshToken: (data[KEYS.refreshToken] as string) ?? null,
    apiBaseUrl: (data[KEYS.apiBaseUrl] as string) ?? DEFAULT_API,
  };
}

export async function setAuthState(
  partial: Partial<AuthState>
): Promise<void> {
  await chrome.storage.local.set(partial);
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([
    KEYS.accessToken,
    KEYS.refreshToken,
  ]);
}

export { KEYS, DEFAULT_API };
