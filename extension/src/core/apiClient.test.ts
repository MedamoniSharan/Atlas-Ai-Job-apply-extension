import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPreferences } from '@cosmo/shared';
import { DEFAULT_JOB_PREFERENCES } from './defaults';

type Store = Record<string, unknown>;

function installChromeMock(store: Store) {
  const chromeMock = {
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[] | null) => {
          if (!key) return { ...store };
          if (typeof key === 'string') {
            return { [key]: store[key] };
          }
          const out: Store = {};
          for (const k of key) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (partial: Store) => {
          Object.assign(store, partial);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) delete store[key];
        }),
      },
    },
  };
  (globalThis as unknown as { chrome?: typeof chromeMock }).chrome = chromeMock;
  return chromeMock;
}

const savedPrefs: JobPreferences = {
  titles: ['Backend Engineer', 'Java Developer', 'Spring Developer'],
  keywords: ['Spring Boot', 'Kafka', 'PostgreSQL', 'Microservices'],
  locations: ['Hyderabad', 'Remote'],
  experienceMin: 2,
  experienceMax: 6,
  minSalaryLpa: 12,
  workMode: 'remote',
  autoScanEnabled: true,
  autoApplyEnabled: true,
};

function okPrefsResponse(data: JobPreferences = savedPrefs) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      message: 'ok',
      data,
      error: null,
    }),
  };
}

function failResponse(
  status: number,
  code: string,
  message = 'failed'
) {
  return {
    ok: false,
    status,
    json: async () => ({
      success: false,
      message,
      data: null,
      error: { code },
    }),
  };
}

describe('fetchPreferences / loadPreferences', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function flush<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return promise;
  }

  it('caches a successful remote fetch', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      apiBaseUrl: 'http://localhost:4000',
    };
    installChromeMock(store);
    vi.mocked(fetch).mockResolvedValue(okPrefsResponse() as Response);

    const { fetchPreferences } = await import('./apiClient');
    const result = await flush(fetchPreferences());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.titles).toEqual(savedPrefs.titles);
    }
    expect(store.preferences).toMatchObject({
      titles: savedPrefs.titles,
      keywords: savedPrefs.keywords,
    });
  });

  it('retries a network throw and then returns cache via loadPreferences', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      apiBaseUrl: 'http://localhost:4000',
      preferences: savedPrefs,
    };
    installChromeMock(store);
    vi.mocked(fetch).mockRejectedValue(new Error('Failed to fetch'));

    const { loadPreferences } = await import('./apiClient');
    const prefs = await flush(loadPreferences());

    expect(prefs.titles).toEqual(savedPrefs.titles);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on a later retry after a transient network error', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      apiBaseUrl: 'http://localhost:4000',
    };
    installChromeMock(store);
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue(okPrefsResponse() as Response);

    const { fetchPreferences } = await import('./apiClient');
    const result = await flush(fetchPreferences());

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.preferences).toMatchObject({ titles: savedPrefs.titles });
  });

  it('does not retry auth failures and keeps the prefs cache', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: null,
      apiBaseUrl: 'http://localhost:4000',
      preferences: savedPrefs,
    };
    installChromeMock(store);
    vi.mocked(fetch).mockResolvedValue(
      failResponse(401, 'UNAUTHORIZED') as Response
    );

    const { fetchPreferences } = await import('./apiClient');
    const remote = await flush(fetchPreferences());
    expect(remote.success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.accessToken).toBeUndefined();
    expect(store.preferences).toEqual(savedPrefs);
  });

  it('falls back to built-in defaults when cache and fetch are both empty', async () => {
    const store: Store = {
      accessToken: 'tok',
      apiBaseUrl: 'http://localhost:4000',
    };
    installChromeMock(store);
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));

    const { loadPreferences } = await import('./apiClient');
    const prefs = await flush(loadPreferences());
    expect(prefs).toEqual(DEFAULT_JOB_PREFERENCES);
  });

  it('reports cache vs remote so the popup can keep a retry button', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      apiBaseUrl: 'http://localhost:4000',
      preferences: savedPrefs,
    };
    installChromeMock(store);
    vi.mocked(fetch).mockRejectedValue(new Error('Failed to fetch'));

    const { loadPreferencesResult } = await import('./apiClient');
    const failed = await flush(loadPreferencesResult());
    expect(failed.source).toBe('cache');
    expect(failed.preferences.titles).toEqual(savedPrefs.titles);
    expect(failed.error).toBeTruthy();

    vi.mocked(fetch).mockResolvedValue(okPrefsResponse() as Response);
    const ok = await flush(loadPreferencesResult());
    expect(ok.source).toBe('remote');
    expect(ok.error).toBeUndefined();
  });
});

describe('session vs auth clear', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps cached preferences when only tokens expire', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      preferences: savedPrefs,
    };
    installChromeMock(store);

    const { clearAuth } = await import('./storageManager');
    await clearAuth();

    expect(store.accessToken).toBeUndefined();
    expect(store.preferences).toEqual(savedPrefs);
  });

  it('drops cached preferences on full logout', async () => {
    const store: Store = {
      accessToken: 'tok',
      refreshToken: 'ref',
      preferences: savedPrefs,
    };
    installChromeMock(store);

    const { clearSession } = await import('./storageManager');
    await clearSession();

    expect(store.accessToken).toBeUndefined();
    expect(store.refreshToken).toBeUndefined();
    expect(store.preferences).toBeUndefined();
  });

  it('reads jwt sub for account-change detection', async () => {
    const { jwtSubject } = await import('./storageManager');
    const token = [
      btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
      btoa(JSON.stringify({ sub: 'user-42', email: 'a@b.c' })),
      'sig',
    ].join('.');
    expect(jwtSubject(token)).toBe('user-42');
    expect(jwtSubject('not-a-jwt')).toBeNull();
  });
});
