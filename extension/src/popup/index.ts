import type { JobPreferences, WorkMode } from '@atlas/shared';
import { DEFAULT_JOB_PREFERENCES } from '../core/defaults';
import type { CopilotAlert, CopilotState } from '../core/copilotState';

const authStateEl = document.getElementById('auth-state')!;
const healthStateEl = document.getElementById('health-state')!;
const scanStateEl = document.getElementById('scan-state')!;
const loginForm = document.getElementById('login-form')!;
const authedSection = document.getElementById('authed')!;
const formError = document.getElementById('form-error')!;
const prefsMsg = document.getElementById('prefs-msg')!;
const toastHost = document.getElementById('popup-toast-host')!;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const apiBaseInput = document.getElementById('api-base') as HTMLInputElement;
const alertEl = document.getElementById('copilot-alert')!;
const alertTitleEl = document.getElementById('copilot-alert-title')!;
const alertMsgEl = document.getElementById('copilot-alert-msg')!;
const alertDismissBtn = document.getElementById('copilot-alert-dismiss')!;

let toastHideTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(
  title: string,
  message: string,
  variant: 'success' | 'error' = 'success'
) {
  toastHost.innerHTML = '';
  const el = document.createElement('div');
  el.className = `popup-toast${variant === 'error' ? ' is-error' : ''}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="popup-toast-icon" aria-hidden="true">${
      variant === 'error' ? '!' : '✓'
    }</div>
    <div class="popup-toast-copy">
      <p class="popup-toast-title"></p>
      <p class="popup-toast-msg"></p>
    </div>
    <button type="button" class="popup-toast-close" aria-label="Dismiss">×</button>
  `;
  (el.querySelector('.popup-toast-title') as HTMLElement).textContent = title;
  (el.querySelector('.popup-toast-msg') as HTMLElement).textContent = message;
  const closeBtn = el.querySelector('.popup-toast-close') as HTMLButtonElement;
  const dismiss = () => {
    el.classList.add('is-out');
    window.setTimeout(() => {
      if (el.parentElement === toastHost) el.remove();
    }, 220);
  };
  closeBtn.addEventListener('click', dismiss);
  toastHost.appendChild(el);
  if (toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(dismiss, 2800);
}

function alertTitle(alert: CopilotAlert): string {
  switch (alert.kind) {
    case 'plan_limit':
      return 'Plan apply limit reached';
    case 'login':
      return 'Naukri login needed';
    case 'questions':
      return 'Answer Naukri questions';
    case 'error':
      return 'Co-pilot error';
    default:
      return 'Co-pilot alert';
  }
}

function renderAlert(alert: CopilotAlert | null | undefined) {
  if (!alert?.message) {
    alertEl.classList.add('hidden');
    alertEl.classList.remove('is-error', 'flash');
    return;
  }
  alertEl.classList.remove('hidden');
  alertEl.classList.toggle('is-error', alert.level === 'error');
  // retrigger flash animation
  alertEl.classList.remove('flash');
  void alertEl.offsetWidth;
  alertEl.classList.add('flash');
  alertTitleEl.textContent = alertTitle(alert);
  alertMsgEl.textContent = alert.message;
}

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
    copilot?: CopilotState;
  }>({ type: 'GET_STATUS' });

  apiBaseInput.value = status.auth.apiBaseUrl;
  const signedIn = Boolean(status.auth.accessToken);
  authStateEl.textContent = signedIn ? 'Signed in' : 'Not signed in';
  authStateEl.classList.toggle('is-ok', signedIn);
  authStateEl.classList.toggle('is-bad', !signedIn);

  const apiOnline = status.health.apiReachable;
  healthStateEl.textContent = `API ${
    apiOnline ? 'online' : 'offline'
  } · Queue ${status.health.queueDepth}${
    status.health.applyQueueDepth
      ? ` · Apply ${status.health.applyQueueDepth}`
      : ''
  }`;
  healthStateEl.classList.toggle('is-ok', apiOnline);
  healthStateEl.classList.toggle('is-bad', !apiOnline);

  renderAlert(status.copilot?.alert);

  if (status.copilot?.running) {
    scanStateEl.textContent = status.copilot.paused
      ? `Co-pilot paused · matched ${status.copilot.matched}, applied ${status.copilot.applied}`
      : `Co-pilot running · matched ${status.copilot.matched}, applied ${status.copilot.applied}`;
  } else {
    scanStateEl.textContent = '';
  }

  loginForm.classList.toggle('hidden', signedIn);
  authedSection.classList.toggle('hidden', !signedIn);

  if (signedIn) {
    // Always pull from DB so popup matches dashboard preferences.
    const prefsRes = await send<{ success: boolean; data: JobPreferences }>({
      type: 'GET_PREFERENCES',
    });
    const prefs = prefsRes?.data ?? status.preferences;
    if (prefs) fillPrefsForm(prefs);
  }
}

alertDismissBtn.addEventListener('click', async () => {
  await send({ type: 'COPILOT_DISMISS_ALERT' });
  renderAlert(null);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.copilotState) {
    const next = changes.copilotState.newValue as CopilotState | undefined;
    renderAlert(next?.alert);
  }
  if (changes.accessToken || changes.refreshToken) {
    void refreshUi();
  }
});


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
    showToast('Missing details', 'Add at least one title or keyword.', 'error');
    return;
  }
  const result = await send<{ success: boolean; message?: string }>({
    type: 'SAVE_PREFERENCES',
    preferences,
  });
  if (!result.success) {
    prefsMsg.textContent = result.message ?? 'Save failed';
    showToast('Save failed', result.message ?? 'Could not save preferences.', 'error');
    return;
  }
  prefsMsg.textContent = '';
  showToast('Preferences saved', 'Your Cosmo settings are up to date.');
});

document.getElementById('logout')!.addEventListener('click', async () => {
  await send({ type: 'LOGOUT' });
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
