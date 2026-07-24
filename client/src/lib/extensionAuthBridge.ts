const API_BASE =
  import.meta.env.VITE_API_BASE?.trim() || 'http://localhost:4000';

const MESSAGE_SOURCE = 'cosmo-web';
const MESSAGE_TYPE = 'COSMO_AUTH_SYNC';

type AuthSyncMessage = {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_TYPE;
  accessToken: string | null;
  refreshToken: string | null;
  apiBaseUrl: string;
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
