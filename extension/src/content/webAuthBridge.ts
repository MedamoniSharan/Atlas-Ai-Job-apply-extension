const MESSAGE_SOURCE = 'atlas-web';
const MESSAGE_TYPE = 'ATLAS_AUTH_SYNC';
const STORAGE_KEY = 'atlas-auth';
const DEFAULT_API = 'http://localhost:4000';

type AuthSyncMessage = {
  source: string;
  type: string;
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl?: string;
};

type PersistedAuth = {
  state?: {
    accessToken?: string | null;
    refreshToken?: string | null;
  };
};

function sendToBackground(message: Record<string, unknown>): void {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

function syncTokens(
  accessToken: string | null,
  refreshToken: string | null,
  apiBaseUrl?: string
): void {
  if (!accessToken || !refreshToken) {
    sendToBackground({ type: 'SYNC_AUTH_FROM_WEB', cleared: true });
    return;
  }

  sendToBackground({
    type: 'SYNC_AUTH_FROM_WEB',
    accessToken,
    refreshToken,
    apiBaseUrl: apiBaseUrl || DEFAULT_API,
  });
}

function readPersistedAuth(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null };
    const parsed = JSON.parse(raw) as PersistedAuth;
    return {
      accessToken: parsed.state?.accessToken ?? null,
      refreshToken: parsed.state?.refreshToken ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function syncFromLocalStorage(): void {
  const { accessToken, refreshToken } = readPersistedAuth();
  syncTokens(accessToken, refreshToken);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const data = event.data as AuthSyncMessage | undefined;
  if (!data || data.source !== MESSAGE_SOURCE || data.type !== MESSAGE_TYPE) {
    return;
  }

  syncTokens(data.accessToken, data.refreshToken, data.apiBaseUrl);
});

syncFromLocalStorage();
