/**
 * Cross-browser helpers for Chromium (Chrome/Edge/Brave/Opera) and Firefox.
 * One TypeScript codebase ships in both packages; detect the host at runtime.
 */

export type BrowserFamily = 'firefox' | 'chromium';

/**
 * Detect Firefox vs Chromium (UA + Firefox-only `browser.runtime.getBrowserInfo`).
 * Safe in service workers, event pages, popups, and content scripts.
 */
export function detectBrowserFamily(): BrowserFamily {
  try {
    const ua =
      typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';
    if (/firefox\//i.test(ua) || /fxios\//i.test(ua)) {
      return 'firefox';
    }
  } catch {
    /* ignore */
  }

  try {
    const root = globalThis as typeof globalThis & {
      browser?: {
        runtime?: { getBrowserInfo?: () => Promise<unknown> };
      };
    };
    if (typeof root.browser?.runtime?.getBrowserInfo === 'function') {
      return 'firefox';
    }
  } catch {
    /* ignore */
  }

  return 'chromium';
}

export function isFirefox(): boolean {
  return detectBrowserFamily() === 'firefox';
}

export function isChromium(): boolean {
  return detectBrowserFamily() === 'chromium';
}

/**
 * Resolve the WebExtensions API namespace. Firefox exposes both `browser`
 * (promise-native) and `chrome` (callback/promise MV3). Prefer `chrome`
 * everywhere so one call style works in both browsers.
 */
export function getExtensionApi(): typeof chrome {
  const root = globalThis as typeof globalThis & {
    chrome?: typeof chrome;
    browser?: typeof chrome;
  };
  if (root.chrome?.runtime?.id != null || typeof root.chrome?.runtime?.sendMessage === 'function') {
    return root.chrome;
  }
  if (root.browser?.runtime) {
    return root.browser as typeof chrome;
  }
  if (root.chrome) return root.chrome;
  throw new Error('WebExtensions API (chrome/browser) is not available');
}

/** Ensure `globalThis.chrome` exists before messaging / storage calls. */
export function ensureChromeNamespace(): typeof chrome {
  const root = globalThis as typeof globalThis & { chrome?: typeof chrome };
  if (!root.chrome?.runtime) {
    root.chrome = getExtensionApi();
  }
  return root.chrome;
}
