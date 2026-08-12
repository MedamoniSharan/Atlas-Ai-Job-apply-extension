import type { JobPreferences } from '@cosmo/shared';
import { API_BASE } from './endpoints';

const MESSAGE_SOURCE = 'cosmo-web';
const MESSAGE_TYPE = 'COSMO_AUTH_SYNC';
const PREFS_MESSAGE_TYPE = 'COSMO_PREFS_SYNC';

type AuthSyncMessage = {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE;
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl: string;
};

type PrefsSyncMessage = {
  source: typeof MESSAGE_SOURCE;
  type: typeof PREFS_MESSAGE_TYPE;
  preferences: JobPreferences;
};

function postAuthMessage(
  accessToken: string | null,
  refreshToken: string | null
): void {
  const message: AuthSyncMessage = {
    source: MESSAGE_SOURCE,
    type: MESSAGE_TYPE,
    accessToken,
    refreshToken,
    apiBaseUrl: API_BASE,
  };
  window.postMessage(message, window.location.origin);
}

export function syncAuthToExtension(tokens: {
  accessToken: string;
  refreshToken: string;
}): void {
  postAuthMessage(tokens.accessToken, tokens.refreshToken);
}

export function clearAuthFromExtension(): void {
  postAuthMessage(null, null);
}

/** Push dashboard prefs into the extension cache so scan/apply don't wait on a GET. */
export function syncPreferencesToExtension(preferences: JobPreferences): void {
  const message: PrefsSyncMessage = {
    source: MESSAGE_SOURCE,
    type: PREFS_MESSAGE_TYPE,
    preferences,
  };
  window.postMessage(message, window.location.origin);
}
