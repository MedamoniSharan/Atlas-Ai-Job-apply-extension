import { beforeEach, describe, expect, it, vi } from 'vitest';

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
        set: vi.fn(async ( partial: Store) => {
          Object.assign(store, partial);
        }),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
  (globalThis as { chrome?: typeof chromeMock }).chrome = chromeMock;
  return chromeMock;
}

describe('noteJobsScanned', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('counts unique job cards and ignores duplicates', async () => {
    const store: Store = {};
    installChromeMock(store);

    const { noteJobsScanned, getCopilotState, DEFAULT_COPILOT_STATE } =
      await import('./copilotState');

    store.copilotState = { ...DEFAULT_COPILOT_STATE, scanned: 0 };
    const keys = new Set<string>();

    const first = await noteJobsScanned(
      [
        { externalJobId: '1', url: 'https://www.naukri.com/job-listings-1' },
        { externalJobId: '2', url: 'https://www.naukri.com/job-listings-2' },
        { externalJobId: '1', url: 'https://www.naukri.com/job-listings-1' },
      ],
      keys
    );
    expect(first).toBe(2);
    expect(keys.size).toBe(2);
    expect((await getCopilotState()).scanned).toBe(2);

    const second = await noteJobsScanned(
      [
        { externalJobId: '2', url: 'https://www.naukri.com/job-listings-2' },
        { externalJobId: '3', url: 'https://www.naukri.com/job-listings-3' },
      ],
      keys
    );
    expect(second).toBe(3);
    expect(keys.size).toBe(3);
    expect((await getCopilotState()).scanned).toBe(3);
  });
});
