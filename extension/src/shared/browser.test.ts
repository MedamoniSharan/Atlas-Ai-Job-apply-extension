import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectBrowserFamily,
  getExtensionApi,
  isChromium,
  isFirefox,
} from './browser';

describe('browser detection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Firefox from userAgent', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    });
    expect(detectBrowserFamily()).toBe('firefox');
    expect(isFirefox()).toBe(true);
    expect(isChromium()).toBe(false);
  });

  it('detects Chromium from Chrome userAgent', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    // Clear Firefox-only API if present from prior tests
    const root = globalThis as { browser?: unknown };
    delete root.browser;
    expect(detectBrowserFamily()).toBe('chromium');
    expect(isChromium()).toBe(true);
  });

  it('prefers chrome namespace from getExtensionApi', () => {
    const chromeApi = {
      runtime: { id: 'abc', sendMessage: vi.fn() },
    };
    vi.stubGlobal('chrome', chromeApi);
    expect(getExtensionApi()).toBe(chromeApi);
  });
});
