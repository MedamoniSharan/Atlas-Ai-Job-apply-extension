import {
  CopilotLogEntry,
  CopilotState,
  DEFAULT_COPILOT_STATE,
  LOG_KEY,
  STATE_KEY,
  getCopilotLogs,
  getCopilotState,
} from '../core/copilotState';
import { NaukriAdapter } from '../adapters/naukriAdapter';

const ROOT_ID = 'atlas-copilot-root';
const naukri = new NaukriAdapter();
const NAUKRI_LOGIN_URL = 'https://www.naukri.com/nlogin/login';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export function mountCopilotPanel() {
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <style>
      #${ROOT_ID} {
        all: initial;
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 2147483646;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      #${ROOT_ID} * { box-sizing: border-box; font-family: inherit; }
      #${ROOT_ID} .atlas-panel {
        width: 340px;
        max-height: 420px;
        display: grid;
        grid-template-rows: auto auto 1fr;
        background: #121a24;
        color: #e8eef5;
        border: 1px solid #2a3b4f;
        border-radius: 14px;
        box-shadow: 0 18px 40px rgba(0,0,0,.35);
        overflow: hidden;
      }
      #${ROOT_ID} .atlas-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: linear-gradient(90deg, #16324a, #122033);
        border-bottom: 1px solid #2a3b4f;
      }
      #${ROOT_ID} .atlas-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.04em;
        min-width: 0;
      }
      #${ROOT_ID} .atlas-brand span.dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #2bb0a6;
        box-shadow: 0 0 0 3px rgba(43,176,166,.2);
        flex-shrink: 0;
      }
      #${ROOT_ID} .atlas-actions { display: flex; gap: 6px; align-items: center; }
      #${ROOT_ID} .atlas-actions-run { display: flex; gap: 6px; align-items: center; }
      #${ROOT_ID} .btn-icon {
        width: 28px;
        height: 28px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        background: transparent;
        color: #8fa3b8;
        border: 1px solid #2a3b4f !important;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1;
      }
      #${ROOT_ID} .btn-icon:hover {
        color: #e8eef5;
        border-color: #3d536b !important;
      }
      #${ROOT_ID} button {
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #${ROOT_ID} .btn-start { background: #2bb0a6; color: #042421; }
      #${ROOT_ID} .btn-pause { background: #3a4a5c; color: #e8eef5; }
      #${ROOT_ID} .btn-stop { background: transparent; color: #e35d6a; border: 1px solid #5a3040; }
      #${ROOT_ID}.collapsed .atlas-panel {
        width: auto;
        max-height: none;
        grid-template-rows: auto;
      }
      #${ROOT_ID}.collapsed .atlas-head {
        border-bottom: 0;
        gap: 10px;
        padding: 8px 10px;
      }
      #${ROOT_ID}.collapsed .atlas-actions-run { display: none; }
      #${ROOT_ID}.collapsed .atlas-log,
      #${ROOT_ID}.collapsed .atlas-meta,
      #${ROOT_ID}.collapsed .atlas-notice,
      #${ROOT_ID}.collapsed .atlas-modal { display: none !important; }
      #${ROOT_ID}.collapsed .atlas-brand-text { display: none; }
      #${ROOT_ID}.collapsed .atlas-mini-label { display: inline; }
      #${ROOT_ID} .atlas-mini-label { display: none; font-size: 12px; font-weight: 650; color: #c5d3e0; }
      #${ROOT_ID} .atlas-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 12px;
        font-size: 11px;
        color: #8fa3b8;
        border-bottom: 1px solid #243446;
      }
      #${ROOT_ID} .toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
      }
      #${ROOT_ID} .atlas-log {
        overflow: auto;
        padding: 8px 10px 12px;
        display: grid;
        gap: 6px;
        max-height: 280px;
      }
      #${ROOT_ID} .log-row {
        display: grid;
        grid-template-columns: 64px 1fr;
        gap: 8px;
        font-size: 12px;
        line-height: 1.35;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(255,255,255,.03);
      }
      #${ROOT_ID} .log-row.success { background: rgba(43,176,166,.12); color: #9ef0e7; }
      #${ROOT_ID} .log-row.warn { background: rgba(227,168,93,.1); color: #f0d2a0; }
      #${ROOT_ID} .log-row.error { background: rgba(227,93,106,.12); color: #f2a0a8; }
      #${ROOT_ID} .log-time { color: #6f8499; font-variant-numeric: tabular-nums; }
      #${ROOT_ID} .atlas-notice {
        display: none;
        margin: 0;
        padding: 8px 12px;
        font-size: 12px;
        line-height: 1.35;
        background: rgba(227,168,93,.18);
        color: #f0d2a0;
        border-bottom: 1px solid #5a4630;
      }
      #${ROOT_ID} .atlas-notice.show { display: block; }
      #${ROOT_ID} .atlas-notice.flash {
        animation: atlas-copilot-flash 1s ease-in-out 4;
      }
      #${ROOT_ID} .atlas-notice.is-alert {
        background: rgba(227,168,93,.28);
        border-bottom-color: #8a6a2a;
        font-weight: 650;
      }
      @keyframes atlas-copilot-flash {
        0%, 100% { filter: brightness(1); box-shadow: inset 0 0 0 0 transparent; }
        50% { filter: brightness(1.35); box-shadow: inset 0 0 0 1px rgba(246,226,168,.55); }
      }
      #${ROOT_ID} .atlas-empty { color: #6f8499; font-size: 12px; padding: 8px; }
      #${ROOT_ID} .atlas-modal {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: calc(100% + 10px);
        z-index: 2;
        background: transparent;
        padding: 0;
        pointer-events: none;
      }
      #${ROOT_ID} .atlas-modal.show { display: block; }
      #${ROOT_ID} .atlas-modal-card {
        width: 100%;
        background: #121a24;
        color: #e8eef5;
        border: 1px solid #2a3b4f;
        border-radius: 14px;
        padding: 14px 14px 12px;
        box-shadow: 0 16px 40px rgba(0,0,0,.45);
        display: grid;
        gap: 10px;
        pointer-events: auto;
      }
      #${ROOT_ID} .atlas-modal-card h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
      }
      #${ROOT_ID} .atlas-modal-card p {
        margin: 0;
        font-size: 12px;
        color: #8fa3b8;
        line-height: 1.4;
      }
      #${ROOT_ID} .atlas-modal-actions {
        display: grid;
        gap: 8px;
      }
      #${ROOT_ID} .btn-login {
        background: #2bb0a6;
        color: #042421;
        width: 100%;
        padding: 10px 12px;
      }
      #${ROOT_ID} .btn-resume-login {
        background: #3a4a5c;
        color: #e8eef5;
        width: 100%;
        padding: 10px 12px;
      }
    </style>
    <div class="atlas-panel">
      <div class="atlas-head">
        <div class="atlas-brand">
          <span class="dot"></span>
          <span class="atlas-brand-text">ATLAS CO-PILOT</span>
          <span class="atlas-mini-label">Atlas</span>
        </div>
        <div class="atlas-actions">
          <div class="atlas-actions-run">
            <button type="button" class="btn-start" id="atlas-start">Start</button>
            <button type="button" class="btn-pause" id="atlas-pause">Pause</button>
            <button type="button" class="btn-stop" id="atlas-stop">Stop</button>
          </div>
          <button
            type="button"
            class="btn-icon"
            id="atlas-minimize"
            title="Minimize"
            aria-label="Minimize co-pilot"
          >
            −
          </button>
        </div>
      </div>
      <div class="atlas-meta">
        <label class="toggle">
          <input type="checkbox" id="atlas-bg" />
          Run in Background
        </label>
        <span id="atlas-stats">Matched 0 · Applied 0</span>
      </div>
      <p class="atlas-notice" id="atlas-notice"></p>
      <div class="atlas-log" id="atlas-log">
        <div class="atlas-empty">Press Start to scan Naukri and open matching jobs.</div>
      </div>
    </div>
    <div class="atlas-modal" id="atlas-login-modal" role="dialog" aria-modal="false">
      <div class="atlas-modal-card">
        <h3>Log in to Naukri to continue</h3>
        <p id="atlas-login-help">
          Opens Naukri login in a new tab. After you sign in, return here and
          press Continue — Atlas will refresh this page and resume.
        </p>
        <div class="atlas-modal-actions">
          <button type="button" class="btn-login" id="atlas-open-login">
            Open login in new tab
          </button>
          <button type="button" class="btn-resume-login" id="atlas-logged-in">
            I&apos;ve logged in — Continue
          </button>
        </div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const logEl = root.querySelector('#atlas-log') as HTMLElement;
  const statsEl = root.querySelector('#atlas-stats') as HTMLElement;
  const noticeEl = root.querySelector('#atlas-notice') as HTMLElement;
  const loginModal = root.querySelector('#atlas-login-modal') as HTMLElement;
  const startBtn = root.querySelector('#atlas-start') as HTMLButtonElement;
  const pauseBtn = root.querySelector('#atlas-pause') as HTMLButtonElement;
  const stopBtn = root.querySelector('#atlas-stop') as HTMLButtonElement;
  const bgToggle = root.querySelector('#atlas-bg') as HTMLInputElement;
  const openLoginBtn = root.querySelector('#atlas-open-login') as HTMLButtonElement;
  const loggedInBtn = root.querySelector('#atlas-logged-in') as HTMLButtonElement;
  const loginHelp = root.querySelector('#atlas-login-help') as HTMLElement;
  const minimizeBtn = root.querySelector('#atlas-minimize') as HTMLButtonElement;

  const RESUME_AFTER_LOGIN_KEY = 'atlas_resume_after_login';
  const RETURN_URL_KEY = 'atlas_return_after_login';
  const COLLAPSED_KEY = 'atlas_copilot_collapsed';
  let lastFlashedAlertAt = '';

  function setCollapsed(collapsed: boolean) {
    root.classList.toggle('collapsed', collapsed);
    minimizeBtn.textContent = collapsed ? '▢' : '−';
    minimizeBtn.title = collapsed ? 'Expand' : 'Minimize';
    minimizeBtn.setAttribute(
      'aria-label',
      collapsed ? 'Expand co-pilot' : 'Minimize co-pilot'
    );
    try {
      sessionStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  try {
    if (sessionStorage.getItem(COLLAPSED_KEY) === '1') {
      setCollapsed(true);
    }
  } catch {
    /* ignore */
  }

  function showLoginModal(show: boolean) {
    loginModal.classList.toggle('show', show);
  }

  function render(logs: CopilotLogEntry[], state: CopilotState) {
    statsEl.textContent = `Matched ${state.matched} · Applied ${state.applied}${
      state.skipped ? ` · Skipped ${state.skipped}` : ''
    }`;
    bgToggle.checked = Boolean(state.runInBackground);
    startBtn.textContent = state.running ? 'Running…' : 'Start';
    startBtn.disabled = state.running && !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    pauseBtn.disabled = !state.running;

    const alert = state.alert;
    const waitingOnLogin =
      state.needsLogin ||
      alert?.kind === 'login' ||
      (state.paused &&
        /log into naukri|not logged into naukri|naukri login|login to continue/i.test(
          state.lastMessage || logs[0]?.message || ''
        ));
    const waitingOnQuestions =
      alert?.kind === 'questions' ||
      (state.paused &&
        !waitingOnLogin &&
        /question/i.test(state.lastMessage || logs[0]?.message || ''));
    const dailyLimit =
      alert?.kind === 'daily_limit' ||
      /daily apply limit/i.test(alert?.message || state.lastMessage || '');

    showLoginModal(Boolean(waitingOnLogin));

    if (alert?.message || waitingOnLogin || waitingOnQuestions || dailyLimit) {
      noticeEl.classList.add('show', 'is-alert');
      noticeEl.textContent =
        alert?.message ||
        (waitingOnLogin
          ? 'Log into Naukri in the new tab, then press Continue here.'
          : waitingOnQuestions
            ? 'Answer Naukri’s questions and save. Atlas continues automatically when apply succeeds, or press Resume.'
            : noticeEl.textContent);
      const flashKey = alert?.at || noticeEl.textContent;
      if (flashKey && flashKey !== lastFlashedAlertAt) {
        lastFlashedAlertAt = flashKey;
        noticeEl.classList.remove('flash');
        void noticeEl.offsetWidth;
        noticeEl.classList.add('flash');
        if (root.classList.contains('collapsed')) {
          setCollapsed(false);
        }
      }
    } else {
      noticeEl.classList.remove('show', 'is-alert', 'flash');
      noticeEl.textContent = '';
    }

    if (!logs.length) {
      logEl.innerHTML =
        '<div class="atlas-empty">Press Start to scan Naukri and open matching jobs.</div>';
      return;
    }
    logEl.innerHTML = logs
      .slice(0, 40)
      .map(
        (l) => `
      <div class="log-row ${l.level}">
        <span class="log-time">${formatTime(l.at)}</span>
        <span>${escapeHtml(l.message)}</span>
      </div>`
      )
      .join('');
  }

  async function refresh() {
    const [logs, state] = await Promise.all([
      getCopilotLogs(),
      getCopilotState(),
    ]);
    render(logs, state);
  }

  async function resumeAfterLoginIfNeeded() {
    try {
      if (sessionStorage.getItem(RESUME_AFTER_LOGIN_KEY) !== '1') return;
      sessionStorage.removeItem(RESUME_AFTER_LOGIN_KEY);

      const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
      sessionStorage.removeItem(RETURN_URL_KEY);

      // If we landed on login/home after auth, bounce back to the scan page.
      const onLoginPage = /\/nlogin\//i.test(window.location.pathname);
      if (returnUrl && onLoginPage) {
        sessionStorage.setItem(RESUME_AFTER_LOGIN_KEY, '1');
        window.location.href = returnUrl;
        return;
      }

      await wait(900);
      const loggedIn = naukri.isLoggedIn(document);
      if (!loggedIn) {
        showLoginModal(true);
        loginHelp.textContent =
          'Still not logged in. Finish login in the other tab, then press Continue again.';
        return;
      }

      showLoginModal(false);
      chrome.runtime.sendMessage({ type: 'COPILOT_RESUME' }, () => void refresh());
    } catch {
      /* ignore */
    }
  }

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'COPILOT_START' }, () => {
      void refresh();
    });
  });
  pauseBtn.addEventListener('click', async () => {
    const state = await getCopilotState();
    chrome.runtime.sendMessage(
      { type: state.paused ? 'COPILOT_RESUME' : 'COPILOT_PAUSE' },
      () => void refresh()
    );
  });
  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'COPILOT_STOP' }, () => void refresh());
  });
  bgToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      {
        type: 'COPILOT_SET_BACKGROUND',
        runInBackground: bgToggle.checked,
      },
      () => void refresh()
    );
  });

  minimizeBtn.addEventListener('click', () => {
    setCollapsed(!root.classList.contains('collapsed'));
  });

  openLoginBtn.addEventListener('click', () => {
    const returnUrl = window.location.href;
    const loginUrl = `${NAUKRI_LOGIN_URL}?URL=${encodeURIComponent(returnUrl)}`;
    chrome.runtime.sendMessage(
      {
        type: 'OPEN_NAUKRI_LOGIN',
        loginUrl,
        returnUrl,
      },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          window.open(loginUrl, '_blank', 'noopener,noreferrer');
        }
        loginHelp.textContent =
          'Login tab opened. Sign in there, then return to this tab and press Continue.';
      }
    );
  });

  loggedInBtn.addEventListener('click', () => {
    loggedInBtn.disabled = true;
    loggedInBtn.textContent = 'Refreshing…';
    try {
      sessionStorage.setItem(RESUME_AFTER_LOGIN_KEY, '1');
      sessionStorage.setItem(RETURN_URL_KEY, window.location.href);
    } catch {
      /* ignore */
    }
    // Reload so the Naukri header picks up the shared login session.
    window.location.reload();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[LOG_KEY] || changes[STATE_KEY]) {
      void refresh();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (
      message?.type === 'COPILOT_REFRESH' ||
      message?.type === 'SHOW_LOGIN_PROMPT' ||
      message?.type === 'COPILOT_ALERT'
    ) {
      void refresh();
      if (message?.type === 'SHOW_LOGIN_PROMPT') {
        showLoginModal(true);
      }
    }
  });

  void refresh();
  void resumeAfterLoginIfNeeded();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { DEFAULT_COPILOT_STATE };
