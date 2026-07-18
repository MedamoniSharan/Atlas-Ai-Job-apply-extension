import type { JobPreferences, WorkMode } from '@atlas/shared';
import { DEFAULT_JOB_PREFERENCES } from '../core/defaults';

const authStateEl = document.getElementById('auth-state')!;
const healthStateEl = document.getElementById('health-state')!;
const scanStateEl = document.getElementById('scan-state')!;
const loginForm = document.getElementById('login-form')!;
const authedSection = document.getElementById('authed')!;
const formError = document.getElementById('form-error')!;
const prefsMsg = document.getElementById('prefs-msg')!;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const apiBaseInput = document.getElementById('api-base') as HTMLInputElement;

function parseList(value: string): string[] {
  return value
    .split(/[,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function send<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

function fillPrefsForm(prefs: JobPreferences) {
  (document.getElementById('pref-titles') as HTMLInputElement).value =
    prefs.titles.join(', ');
  (document.getElementById('pref-keywords') as HTMLInputElement).value =
    prefs.keywords.join(', ');
  (document.getElementById('pref-locations') as HTMLInputElement).value =
    prefs.locations.join(', ');
  (document.getElementById('pref-exp-min') as HTMLInputElement).value = String(
    prefs.experienceMin
  );
  (document.getElementById('pref-exp-max') as HTMLInputElement).value = String(
    prefs.experienceMax
  );
  (document.getElementById('pref-salary') as HTMLInputElement).value =
    prefs.minSalaryLpa != null ? String(prefs.minSalaryLpa) : '';
  (document.getElementById('pref-work-mode') as HTMLSelectElement).value =
    prefs.workMode;
  (document.getElementById('pref-auto-scan') as HTMLInputElement).checked =
    prefs.autoScanEnabled;
  (document.getElementById('pref-auto-apply') as HTMLInputElement).checked =
    prefs.autoApplyEnabled;
  (document.getElementById('pref-daily-limit') as HTMLInputElement).value =
    String(prefs.dailyApplyLimit);
}

function readPrefsForm(): JobPreferences {
  const salaryRaw = (document.getElementById('pref-salary') as HTMLInputElement)
    .value;
  return {
    ...DEFAULT_JOB_PREFERENCES,
    titles: parseList(
      (document.getElementById('pref-titles') as HTMLInputElement).value
    ),
    keywords: parseList(
      (document.getElementById('pref-keywords') as HTMLInputElement).value
    ),
    locations: parseList(
      (document.getElementById('pref-locations') as HTMLInputElement).value
    ),
    experienceMin: Number(
      (document.getElementById('pref-exp-min') as HTMLInputElement).value
    ),
    experienceMax: Number(
      (document.getElementById('pref-exp-max') as HTMLInputElement).value
    ),
    minSalaryLpa: salaryRaw === '' ? undefined : Number(salaryRaw),
    workMode: (document.getElementById('pref-work-mode') as HTMLSelectElement)
      .value as WorkMode,
    autoScanEnabled: (
      document.getElementById('pref-auto-scan') as HTMLInputElement
    ).checked,
    autoApplyEnabled: (
      document.getElementById('pref-auto-apply') as HTMLInputElement
    ).checked,
    dailyApplyLimit: Number(
      (document.getElementById('pref-daily-limit') as HTMLInputElement).value
    ),
  };
}

async function refreshUi() {
  const status = await send<{
    auth: {
      accessToken: string | null;
      apiBaseUrl: string;
    };
    health: {
      apiReachable: boolean;
      authenticated: boolean;
      queueDepth: number;
      applyQueueDepth?: number;
    };
    preferences?: JobPreferences;
  }>({ type: 'GET_STATUS' });

  apiBaseInput.value = status.auth.apiBaseUrl;
  const signedIn = Boolean(status.auth.accessToken);
  authStateEl.textContent = signedIn ? 'Signed in' : 'Not signed in';
  healthStateEl.textContent = `API ${
    status.health.apiReachable ? 'online' : 'offline'
  } · Queue ${status.health.queueDepth}${
    status.health.applyQueueDepth
      ? ` · Apply ${status.health.applyQueueDepth}`
      : ''
  }`;

  loginForm.classList.toggle('hidden', signedIn);
  authedSection.classList.toggle('hidden', !signedIn);

  if (signedIn) {
    const prefs =
      status.preferences ??
      (
        await send<{ success: boolean; data: JobPreferences }>({
          type: 'GET_PREFERENCES',
        })
      ).data;
    if (prefs) fillPrefsForm(prefs);
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';
  await send({ type: 'SET_API_BASE', apiBaseUrl: apiBaseInput.value });
  const result = await send<{ success: boolean; message?: string }>({
    type: 'LOGIN',
    email: emailInput.value,
    password: passwordInput.value,
  });
  if (!result.success) {
    formError.textContent = result.message ?? 'Login failed';
    return;
  }
  await refreshUi();
});

document.getElementById('prefs-form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  prefsMsg.textContent = 'Saving…';
  const preferences = readPrefsForm();
  if (!preferences.titles.length && !preferences.keywords.length) {
    prefsMsg.textContent = 'Add at least one title or keyword.';
    return;
  }
  const result = await send<{ success: boolean; message?: string }>({
    type: 'SAVE_PREFERENCES',
    preferences,
  });
  if (!result.success) {
    prefsMsg.textContent = result.message ?? 'Save failed';
    return;
  }
  prefsMsg.textContent = 'Saved. Opening Naukri Co-Pilot…';
  scanStateEl.textContent = 'Open the bottom-left Atlas Co-Pilot and press Start.';
  await chrome.tabs.create({ url: 'https://www.naukri.com', active: true });
});

document.getElementById('logout')!.addEventListener('click', async () => {
  await send({ type: 'LOGOUT' });
  await refreshUi();
});

document.getElementById('sync-now')!.addEventListener('click', async () => {
  await send({ type: 'FLUSH_QUEUE' });
  await refreshUi();
});

document.getElementById('scan-now')!.addEventListener('click', async () => {
  scanStateEl.textContent = 'Starting co-pilot on Naukri…';
  const result = await send<{
    ok: boolean;
    message?: string;
  }>({ type: 'COPILOT_START' });
  scanStateEl.textContent = result.ok
    ? 'Co-pilot started — watch the panel on Naukri.'
    : result.message ?? 'Could not start';
  await refreshUi();
});

refreshUi();
