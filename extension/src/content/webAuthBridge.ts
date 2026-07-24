const MESSAGE_SOURCE = 'cosmo-web';
const MESSAGE_TYPE = 'COSMO_AUTH_SYNC';
/** Legacy keys from the Atlas rename — still accepted so existing sessions migrate. */
const LEGACY_MESSAGE_SOURCE = 'atlas-web';
const LEGACY_MESSAGE_TYPE = 'ATLAS_AUTH_SYNC';
const STORAGE_KEY = 'cosmo-auth';
const LEGACY_STORAGE_KEY = 'atlas-auth';
import { PRODUCTION_API_BASE } from '../core/allowedApiBases';

const DEFAULT_API = PRODUCTION_API_BASE;

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
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
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

function isAuthSyncMessage(data: AuthSyncMessage | undefined): boolean {
  if (!data) return false;
  const sourceOk =
    data.source === MESSAGE_SOURCE || data.source === LEGACY_MESSAGE_SOURCE;
  const typeOk =
    data.type === MESSAGE_TYPE || data.type === LEGACY_MESSAGE_TYPE;
  return sourceOk && typeOk;
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const data = event.data as AuthSyncMessage | undefined;
  if (!isAuthSyncMessage(data)) {
    return;
  }

  syncTokens(data!.accessToken, data!.refreshToken, data!.apiBaseUrl);
});

syncFromLocalStorage();
