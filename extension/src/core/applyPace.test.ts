import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_JOB_PREFERENCES } from '@cosmo/shared';
import {
  NaukriAdapter,
  matchesPreferences,
  preferenceSkipReason,
} from '../adapters/naukriAdapter';

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
      },
      onChanged: { addListener: vi.fn() },
    },
  };
  (globalThis as unknown as { chrome?: typeof chromeMock }).chrome = chromeMock;
  return chromeMock;
}

/** Mirrors PROBE_APPLY_READY in content/index.ts */
function probeApplyReady(doc: Document, adapter: NaukriAdapter): boolean {
  return Boolean(
    adapter.findEasyApplyButton(doc) && !adapter.isCompanySiteApply(doc)
  );
}

describe('apply-ready probe (content PROBE_APPLY_READY)', () => {
  it('is ready when Apply button is visible', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Software Engineer</h1>
        <button type="button" class="styles_apply-button__uJI3A">Apply</button>
      </div>
    `;
    expect(probeApplyReady(document, adapter)).toBe(true);
  });

  it('is not ready for company-site apply', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Backend Engineer</h1>
        <button type="button">Apply on company site</button>
      </div>
    `;
    expect(probeApplyReady(document, adapter)).toBe(false);
    expect(adapter.findEasyApplyButton(document)).toBeNull();
  });

  it('is not ready when only Save is present', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Software Engineer</h1>
        <button type="button">Save</button>
      </div>
    `;
    expect(probeApplyReady(document, adapter)).toBe(false);
  });
});

describe('detail preference gate after list match (applyOneJob)', () => {
  const prefs = {
    ...DEFAULT_JOB_PREFERENCES,
    titles: ['Software Engineer'],
    keywords: ['React'],
    minSalaryLpa: 10,
    experienceMin: 2,
    experienceMax: 6,
  };

  it('does not skip list-matched jobs solely for undisclosed salary', () => {
    const job = {
      title: 'Software Engineer',
      company: 'Acme',
      url: 'https://www.naukri.com/job-listings-1',
      experienceText: '3-5 Yrs',
      salaryText: 'Not Disclosed',
      skills: ['React'],
    };
    // Default gate (scan-detail old behavior) would skip.
    expect(preferenceSkipReason(job, prefs)).toMatch(/Salary not disclosed/i);
    // Apply-path fix: already list-matched → allow missing salary.
    expect(
      preferenceSkipReason(job, prefs, { requireDisclosedSalary: false })
    ).toBeNull();
    expect(
      matchesPreferences(job, prefs, { requireDisclosedSalary: false })
    ).toBe(true);
  });

  it('still skips when disclosed salary is below minimum', () => {
    const job = {
      title: 'Software Engineer',
      company: 'Acme',
      url: 'https://www.naukri.com/job-listings-2',
      experienceText: '3-5 Yrs',
      salaryText: '6-8 LPA',
      skills: ['React'],
    };
    expect(
      preferenceSkipReason(job, prefs, { requireDisclosedSalary: false })
    ).toMatch(/below minimum/i);
  });
});

describe('pacedWait maxMs cap when Apply is ready', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  it('caps nav/dwell waits so Apply click is not blocked by full slowdown', async () => {
    const store: Store = {};
    installChromeMock(store);

    const { pacedWait } = await import('./humanPace');
    const { DEFAULT_COPILOT_STATE, setCopilotState, getCopilotState } =
      await import('./copilotState');

    store.copilotState = {
      ...DEFAULT_COPILOT_STATE,
      running: true,
      paused: false,
    };

    const started = Date.now();
    const done = pacedWait('assisted', 'dwell', {
      maxMs: 350,
      label: 'About to apply',
      jobTitle: 'Software Engineer',
      silent: true,
    });

    // Full dwell is 3200–6500ms; with maxMs 350 it must finish quickly.
    await vi.advanceTimersByTimeAsync(400);
    const ok = await done;
    const elapsed = Date.now() - started;

    expect(ok).toBe(true);
    expect(elapsed).toBeLessThan(800);

    const state = await getCopilotState();
    expect(state.paceLabel).toBeNull();
    // Keep chrome mock happy if setCopilotState was used.
    await setCopilotState({ currentTitle: '' });
  });

  it('returns false immediately when session is stopped mid-wait', async () => {
    const store: Store = {};
    installChromeMock(store);

    const { pacedWait } = await import('./humanPace');
    const { DEFAULT_COPILOT_STATE, setCopilotState } = await import(
      './copilotState'
    );

    store.copilotState = {
      ...DEFAULT_COPILOT_STATE,
      running: true,
      paused: false,
    };

    const done = pacedWait('assisted', 'nav', {
      maxMs: 2000,
      silent: true,
    });

    await vi.advanceTimersByTimeAsync(50);
    await setCopilotState({ running: false });
    await vi.advanceTimersByTimeAsync(1200);
    expect(await done).toBe(false);
  });

  it('caps betweenJobs well under the 5.5s assisted floor during apply batch', async () => {
    const store: Store = {};
    installChromeMock(store);

    const { pacedWait, APPLY_BATCH_BETWEEN_JOBS_MAX_MS } = await import(
      './humanPace'
    );
    const { DEFAULT_COPILOT_STATE, getCopilotState } = await import(
      './copilotState'
    );

    store.copilotState = {
      ...DEFAULT_COPILOT_STATE,
      running: true,
      paused: false,
    };

    const started = Date.now();
    const done = pacedWait('assisted', 'betweenJobs', {
      maxMs: APPLY_BATCH_BETWEEN_JOBS_MAX_MS,
      label: 'Next job',
      silent: true,
    });

    await vi.advanceTimersByTimeAsync(APPLY_BATCH_BETWEEN_JOBS_MAX_MS + 50);
    const ok = await done;
    const elapsed = Date.now() - started;

    expect(ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
    expect(elapsed).toBeLessThan(5500);

    const state = await getCopilotState();
    expect(state.paceLabel).toBeNull();
  });
});
