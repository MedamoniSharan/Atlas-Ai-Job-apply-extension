import {
  CopilotLogEntry,
  CopilotState,
  CopilotToast,
  DEFAULT_COPILOT_STATE,
  LOG_KEY,
  STATE_KEY,
  ScannedJobItem,
  clearCopilotToast,
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
    });
  } catch {
    return '';
  }
}

function statusLabel(status: ScannedJobItem['status']): string {
  switch (status) {
    case 'pending':
      return 'Queued';
    case 'applying':
      return 'Opening';
    case 'applied':
      return 'Applied';
    case 'already_applied':
      return 'Already applied';
    case 'skipped':
      return 'Skipped';
    default:
      return status;
  }
}

function statusMark(status: ScannedJobItem['status']): string {
  switch (status) {
    case 'applied':
      return '✓';
    case 'already_applied':
    case 'skipped':
      return '✕';
    case 'applying':
      return '…';
    default:
      return '○';
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
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
        font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
        --atlas-bg: #0e1620;
        --atlas-panel: #121c28;
        --atlas-elevated: #182433;
        --atlas-line: #243447;
        --atlas-text: #e7eef6;
        --atlas-muted: #8fa3b8;
        --atlas-teal: #2bb0a6;
        --atlas-teal-dim: rgba(43,176,166,.16);
        --atlas-warn: #e3a85d;
        --atlas-danger: #e35d6a;
      }
      #${ROOT_ID} * { box-sizing: border-box; font-family: inherit; }
      #${ROOT_ID} .atlas-dock {
        pointer-events: auto;
        position: fixed;
        left: 16px;
        bottom: 16px;
        width: 380px;
      }
      #${ROOT_ID} .atlas-panel {
        width: 100%;
        max-height: min(560px, calc(100vh - 32px));
        display: grid;
        grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
        background:
          radial-gradient(120% 80% at 0% 0%, rgba(43,176,166,.12), transparent 55%),
          linear-gradient(180deg, #152233 0%, var(--atlas-panel) 42%, #0f1722 100%);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line);
        border-radius: 16px;
        box-shadow:
          0 22px 48px rgba(0,0,0,.42),
          0 0 0 1px rgba(255,255,255,.03) inset;
        overflow: hidden;
        animation: atlas-panel-in .28s ease-out;
      }
      @keyframes atlas-panel-in {
        from { opacity: 0; transform: translateY(10px) scale(.98); }
        to { opacity: 1; transform: none; }
      }
      #${ROOT_ID} .atlas-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 12px 10px;
      }
      #${ROOT_ID} .atlas-brand {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }
      #${ROOT_ID} .atlas-brand span.dot {
        width: 9px; height: 9px; border-radius: 50%;
        background: var(--atlas-teal);
        box-shadow: 0 0 0 3px var(--atlas-teal-dim);
        flex-shrink: 0;
        transition: background .2s ease, box-shadow .2s ease;
      }
      #${ROOT_ID}.is-running .atlas-brand span.dot {
        animation: atlas-pulse 1.6s ease-in-out infinite;
      }
      #${ROOT_ID}.is-paused .atlas-brand span.dot {
        background: var(--atlas-warn);
        box-shadow: 0 0 0 3px rgba(227,168,93,.2);
        animation: none;
      }
      @keyframes atlas-pulse {
        0%, 100% { box-shadow: 0 0 0 3px var(--atlas-teal-dim); }
        50% { box-shadow: 0 0 0 6px rgba(43,176,166,.08); }
      }
      #${ROOT_ID} .atlas-brand-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
      }
      #${ROOT_ID} .atlas-brand-text {
        font-weight: 750;
        font-size: 13px;
        letter-spacing: 0.06em;
        line-height: 1.1;
      }
      #${ROOT_ID} .atlas-brand-sub {
        font-size: 10px;
        color: var(--atlas-muted);
        letter-spacing: 0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .atlas-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
      #${ROOT_ID} .atlas-actions-run { display: flex; gap: 5px; align-items: center; }
      #${ROOT_ID} .btn-icon {
        width: 30px;
        height: 30px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        background: rgba(255,255,255,.03);
        color: var(--atlas-muted);
        border: 1px solid var(--atlas-line) !important;
        border-radius: 9px;
        font-size: 15px;
        line-height: 1;
        transition: color .15s ease, border-color .15s ease, background .15s ease;
      }
      #${ROOT_ID} .btn-icon:hover {
        color: var(--atlas-text);
        border-color: #3d536b !important;
        background: rgba(255,255,255,.06);
      }
      #${ROOT_ID} button {
        border: 0;
        border-radius: 9px;
        padding: 7px 11px;
        font-size: 12px;
        font-weight: 650;
        cursor: pointer;
        transition: transform .12s ease, filter .12s ease, background .15s ease;
      }
      #${ROOT_ID} button:disabled {
        opacity: .45;
        cursor: not-allowed;
        transform: none !important;
      }
      #${ROOT_ID} button:not(:disabled):hover { filter: brightness(1.06); }
      #${ROOT_ID} button:not(:disabled):active { transform: translateY(1px); }
      #${ROOT_ID} .btn-start { background: var(--atlas-teal); color: #042421; }
      #${ROOT_ID} .btn-pause { background: #2a3a4d; color: var(--atlas-text); }
      #${ROOT_ID} .btn-stop {
        background: transparent;
        color: var(--atlas-danger);
        border: 1px solid #5a3040 !important;
      }
      #${ROOT_ID} .atlas-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 0 12px 10px;
      }
      #${ROOT_ID} .stat {
        background: rgba(255,255,255,.035);
        border: 1px solid rgba(255,255,255,.05);
        border-radius: 10px;
        padding: 8px 8px 7px;
        text-align: center;
      }
      #${ROOT_ID} .stat-n {
        display: block;
        font-size: 16px;
        font-weight: 750;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
        color: var(--atlas-text);
      }
      #${ROOT_ID} .stat-l {
        display: block;
        margin-top: 2px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--atlas-muted);
      }
      #${ROOT_ID} .stat--applied .stat-n { color: #7ee0d7; }
      #${ROOT_ID} .stat--skipped .stat-n { color: #f0d2a0; }
      #${ROOT_ID} .atlas-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 0 12px 10px;
        font-size: 11px;
        color: var(--atlas-muted);
      }
      #${ROOT_ID} .toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        cursor: pointer;
        user-select: none;
      }
      #${ROOT_ID} .toggle input {
        accent-color: var(--atlas-teal);
        width: 13px;
        height: 13px;
      }
      #${ROOT_ID} .atlas-now {
        display: none;
        margin: 0 12px 10px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--atlas-teal-dim);
        border: 1px solid rgba(43,176,166,.28);
        font-size: 12px;
        line-height: 1.35;
        color: #b7f3ed;
      }
      #${ROOT_ID} .atlas-now.show { display: block; }
      #${ROOT_ID} .atlas-now strong {
        display: block;
        font-size: 10px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #7ed9d0;
        margin-bottom: 2px;
        font-weight: 700;
      }
      #${ROOT_ID} .atlas-section {
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border-top: 1px solid var(--atlas-line);
      }
      #${ROOT_ID} .atlas-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 6px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--atlas-muted);
      }
      #${ROOT_ID} .atlas-jobs {
        overflow: auto;
        padding: 0 8px 10px;
        display: grid;
        gap: 5px;
        max-height: 240px;
        scrollbar-width: thin;
        scrollbar-color: #33485e transparent;
      }
      #${ROOT_ID} .job-row {
        display: grid;
        grid-template-columns: 22px 1fr auto;
        gap: 8px;
        align-items: start;
        padding: 8px 9px;
        border-radius: 10px;
        background: rgba(255,255,255,.03);
        border: 1px solid transparent;
        font-size: 12px;
        line-height: 1.3;
        transition: background .15s ease, border-color .15s ease;
      }
      #${ROOT_ID} .job-row:hover {
        background: rgba(255,255,255,.05);
      }
      #${ROOT_ID} .job-row.applying {
        background: var(--atlas-teal-dim);
        border-color: rgba(43,176,166,.35);
      }
      #${ROOT_ID} .job-row.applied {
        background: rgba(43,176,166,.08);
      }
      #${ROOT_ID} .job-row.skipped,
      #${ROOT_ID} .job-row.already_applied {
        background: rgba(227,168,93,.07);
      }
      #${ROOT_ID} .job-check {
        width: 20px;
        height: 20px;
        margin-top: 1px;
        border-radius: 6px;
        display: inline-grid;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
        line-height: 1;
        flex-shrink: 0;
        background: #243446;
        color: #8fa3b8;
        border: 1px solid #33485e;
      }
      #${ROOT_ID} .job-check.applied {
        background: rgba(43,176,166,.25);
        border-color: rgba(43,176,166,.45);
        color: #9ef0e7;
      }
      #${ROOT_ID} .job-check.skipped,
      #${ROOT_ID} .job-check.already_applied {
        background: rgba(227,168,93,.2);
        border-color: rgba(227,168,93,.4);
        color: #f0d2a0;
      }
      #${ROOT_ID} .job-check.applying {
        background: rgba(43,176,166,.2);
        border-color: rgba(43,176,166,.35);
        color: #9ef0e7;
      }
      #${ROOT_ID} .job-title {
        font-weight: 650;
        color: var(--atlas-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .job-company {
        margin-top: 1px;
        color: var(--atlas-muted);
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .job-reason {
        margin-top: 3px;
        font-size: 10px;
        color: #c4a574;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .job-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 3px 7px;
        border-radius: 999px;
        white-space: nowrap;
        background: #243446;
        color: #a9bdd0;
        margin-top: 1px;
      }
      #${ROOT_ID} .job-badge.pending { background: #243446; color: #a9bdd0; }
      #${ROOT_ID} .job-badge.applied { background: rgba(43,176,166,.2); color: #9ef0e7; }
      #${ROOT_ID} .job-badge.skipped,
      #${ROOT_ID} .job-badge.already_applied { background: rgba(227,168,93,.15); color: #f0d2a0; }
      #${ROOT_ID} .job-badge.applying { background: rgba(43,176,166,.28); color: #9ef0e7; }
      #${ROOT_ID} .atlas-log-wrap {
        border-top: 1px solid var(--atlas-line);
        min-height: 0;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }
      #${ROOT_ID} .atlas-log {
        overflow: auto;
        padding: 0 8px 10px;
        display: grid;
        gap: 3px;
        max-height: 120px;
        scrollbar-width: thin;
        scrollbar-color: #33485e transparent;
      }
      #${ROOT_ID} .log-row {
        display: grid;
        grid-template-columns: 42px 1fr;
        gap: 8px;
        font-size: 11px;
        line-height: 1.35;
        padding: 5px 8px;
        border-radius: 8px;
        color: #c5d3e0;
      }
      #${ROOT_ID} .log-row.success { color: #9ef0e7; }
      #${ROOT_ID} .log-row.warn { color: #f0d2a0; }
      #${ROOT_ID} .log-row.error { color: #f2a0a8; }
      #${ROOT_ID} .log-time {
        color: #6f8499;
        font-variant-numeric: tabular-nums;
        font-size: 10px;
        padding-top: 1px;
      }
      #${ROOT_ID} .atlas-notice {
        display: none;
        margin: 0 12px 10px;
        padding: 9px 11px;
        font-size: 12px;
        line-height: 1.4;
        background: rgba(227,168,93,.16);
        color: #f0d2a0;
        border: 1px solid rgba(227,168,93,.28);
        border-radius: 10px;
      }
      #${ROOT_ID} .atlas-notice.show { display: block; }
      #${ROOT_ID} .atlas-notice.flash {
        animation: atlas-copilot-flash 1s ease-in-out 4;
      }
      #${ROOT_ID} .atlas-notice.is-alert { font-weight: 650; }
      @keyframes atlas-copilot-flash {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.25); }
      }
      #${ROOT_ID} .atlas-empty {
        color: var(--atlas-muted);
        font-size: 12px;
        padding: 14px 10px;
        text-align: center;
        line-height: 1.45;
      }
      #${ROOT_ID}.collapsed .atlas-dock {
        width: auto;
      }
      #${ROOT_ID}.collapsed .atlas-panel {
        width: auto;
        max-height: none;
        grid-template-rows: auto;
        animation: none;
      }
      #${ROOT_ID}.collapsed .atlas-head { padding: 8px 10px; }
      #${ROOT_ID}.collapsed .atlas-actions-run,
      #${ROOT_ID}.collapsed .atlas-brand-sub,
      #${ROOT_ID}.collapsed .atlas-stats,
      #${ROOT_ID}.collapsed .atlas-meta,
      #${ROOT_ID}.collapsed .atlas-now,
      #${ROOT_ID}.collapsed .atlas-section,
      #${ROOT_ID}.collapsed .atlas-log-wrap,
      #${ROOT_ID}.collapsed .atlas-notice,
      #${ROOT_ID}.collapsed .atlas-modal { display: none !important; }
      #${ROOT_ID}.collapsed .atlas-brand-text { font-size: 12px; letter-spacing: 0.04em; }
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
        background: var(--atlas-bg);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line);
        border-radius: 14px;
        padding: 14px;
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
        color: var(--atlas-muted);
        line-height: 1.4;
      }
      #${ROOT_ID} .atlas-modal-actions { display: grid; gap: 8px; }
      #${ROOT_ID} .btn-login {
        background: var(--atlas-teal);
        color: #042421;
        width: 100%;
        padding: 10px 12px;
      }
      #${ROOT_ID} .btn-resume-login {
        background: #2a3a4d;
        color: var(--atlas-text);
        width: 100%;
        padding: 10px 12px;
      }
      #${ROOT_ID} .atlas-toast-host {
        pointer-events: none;
        position: fixed;
        top: 16px;
        right: 16px;
        left: auto;
        bottom: auto;
        z-index: 2147483647;
        display: grid;
        gap: 8px;
        width: min(360px, calc(100vw - 32px));
      }
      #${ROOT_ID} .atlas-toast {
        pointer-events: auto;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: start;
        padding: 12px 12px 12px 14px;
        border-radius: 12px;
        background: #102018;
        color: #e8f7f2;
        border: 1px solid rgba(43,176,166,.45);
        box-shadow:
          0 16px 36px rgba(0,0,0,.4),
          0 0 0 1px rgba(255,255,255,.04) inset;
        animation: atlas-toast-in .28s ease-out;
      }
      #${ROOT_ID} .atlas-toast.is-warn {
        background: #1f1810;
        border-color: rgba(227,168,93,.5);
        color: #f7efe2;
      }
      #${ROOT_ID} .atlas-toast.is-out {
        animation: atlas-toast-out .22s ease-in forwards;
      }
      @keyframes atlas-toast-in {
        from { opacity: 0; transform: translateY(-8px) translateX(8px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes atlas-toast-out {
        to { opacity: 0; transform: translateY(-6px) translateX(6px); }
      }
      #${ROOT_ID} .atlas-toast-icon {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(43,176,166,.22);
        color: #2bb0a6;
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
        margin-top: 1px;
      }
      #${ROOT_ID} .atlas-toast.is-warn .atlas-toast-icon {
        background: rgba(227,168,93,.22);
        color: #e3a85d;
      }
      #${ROOT_ID} .atlas-toast-copy {
        min-width: 0;
      }
      #${ROOT_ID} .atlas-toast-title {
        margin: 0;
        font-size: 13px;
        font-weight: 750;
        color: #9ef0e7;
        line-height: 1.25;
      }
      #${ROOT_ID} .atlas-toast.is-warn .atlas-toast-title {
        color: #f0d2a0;
      }
      #${ROOT_ID} .atlas-toast-msg {
        margin: 3px 0 0;
        font-size: 12px;
        color: #b7c9d8;
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #${ROOT_ID} .atlas-toast-close {
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 7px;
        background: transparent;
        color: #8fa3b8;
        border: 0 !important;
        font-size: 14px;
        line-height: 1;
      }
      #${ROOT_ID} .atlas-toast-close:hover {
        color: #e8eef5;
        background: rgba(255,255,255,.06);
      }
      #${ROOT_ID}.collapsed .atlas-toast-host { display: grid !important; }
    </style>
    <div class="atlas-toast-host" id="atlas-toast-host" aria-live="polite"></div>
    <div class="atlas-dock">
    <div class="atlas-panel">
      <div class="atlas-head">
        <div class="atlas-brand">
          <span class="dot"></span>
          <div class="atlas-brand-copy">
            <span class="atlas-brand-text">ATLAS CO-PILOT</span>
            <span class="atlas-brand-sub" id="atlas-status-label">Idle — press Start</span>
          </div>
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
      <div class="atlas-stats" id="atlas-stats" aria-label="Session stats">
        <div class="stat">
          <span class="stat-n" id="stat-matched">0</span>
          <span class="stat-l">Matched</span>
        </div>
        <div class="stat stat--applied">
          <span class="stat-n" id="stat-applied">0</span>
          <span class="stat-l">Applied</span>
        </div>
        <div class="stat stat--skipped">
          <span class="stat-n" id="stat-skipped">0</span>
          <span class="stat-l">Skipped</span>
        </div>
      </div>
      <div class="atlas-meta">
        <label class="toggle">
          <input type="checkbox" id="atlas-bg" />
          Run in background
        </label>
        <span id="atlas-keyword"></span>
      </div>
      <div class="atlas-now" id="atlas-now"></div>
      <p class="atlas-notice" id="atlas-notice"></p>
      <section class="atlas-section">
        <div class="atlas-section-head">
          <span>Checklist</span>
          <span id="atlas-jobs-count">0</span>
        </div>
        <div class="atlas-jobs" id="atlas-jobs">
          <div class="atlas-empty">Jobs show here as Applied ✓ or Skipped ✕ while Atlas runs.</div>
        </div>
      </section>
      <section class="atlas-log-wrap">
        <div class="atlas-section-head">
          <span>Activity</span>
        </div>
        <div class="atlas-log" id="atlas-log">
          <div class="atlas-empty">Press Start to browse Naukri like a human — open, apply or skip, then scroll for more.</div>
        </div>
      </section>
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
    </div>
  `;
  document.documentElement.appendChild(root);

  const logEl = root.querySelector('#atlas-log') as HTMLElement;
  const jobsEl = root.querySelector('#atlas-jobs') as HTMLElement;
  const jobsCountEl = root.querySelector('#atlas-jobs-count') as HTMLElement;
  const matchedEl = root.querySelector('#stat-matched') as HTMLElement;
  const appliedEl = root.querySelector('#stat-applied') as HTMLElement;
  const skippedEl = root.querySelector('#stat-skipped') as HTMLElement;
  const statusLabelEl = root.querySelector('#atlas-status-label') as HTMLElement;
  const keywordEl = root.querySelector('#atlas-keyword') as HTMLElement;
  const nowEl = root.querySelector('#atlas-now') as HTMLElement;
  const noticeEl = root.querySelector('#atlas-notice') as HTMLElement;
  const toastHost = root.querySelector('#atlas-toast-host') as HTMLElement;
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
  let lastToastId = '';
  let toastHideTimer: ReturnType<typeof setTimeout> | null = null;

  function dismissToast(el: HTMLElement, clearState = true) {
    el.classList.add('is-out');
    window.setTimeout(() => {
      el.remove();
      if (clearState) {
        void clearCopilotToast();
      }
    }, 220);
  }

  function showToast(toast: CopilotToast) {
    if (!toast?.id || toast.id === lastToastId) return;
    lastToastId = toast.id;
    toastHost.innerHTML = '';
    const el = document.createElement('div');
    const isWarn = toast.kind === 'warn';
    el.className = `atlas-toast${isWarn ? ' is-warn' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="atlas-toast-icon" aria-hidden="true">${isWarn ? '!' : '✓'}</div>
      <div class="atlas-toast-copy">
        <p class="atlas-toast-title">${escapeHtml(toast.title)}</p>
        <p class="atlas-toast-msg">${escapeHtml(toast.message)}</p>
      </div>
      <button type="button" class="atlas-toast-close" aria-label="Dismiss">×</button>
    `;
    const closeBtn = el.querySelector('.atlas-toast-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => dismissToast(el));
    toastHost.appendChild(el);
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => {
      if (el.isConnected) dismissToast(el);
    }, 4200);
  }

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

  function renderJobs(jobs: ScannedJobItem[]) {
    const appliedCount = jobs.filter((j) => j.status === 'applied').length;
    const skippedCount = jobs.filter(
      (j) => j.status === 'skipped' || j.status === 'already_applied'
    ).length;
    jobsCountEl.textContent =
      jobs.length === 0
        ? '0'
        : `${jobs.length} · ✓${appliedCount} ✕${skippedCount}`;

    if (!jobs.length) {
      jobsEl.innerHTML =
        '<div class="atlas-empty">Jobs show here as Applied ✓ or Skipped ✕ while Atlas runs.</div>';
      return;
    }
    // Newest outcomes first: applying, then applied, skipped, queued.
    const order: Record<ScannedJobItem['status'], number> = {
      applying: 0,
      applied: 1,
      skipped: 2,
      already_applied: 3,
      pending: 4,
    };
    const sorted = [...jobs].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    );
    jobsEl.innerHTML = sorted
      .slice(0, 60)
      .map((j) => {
        const reason =
          j.status === 'skipped' || j.status === 'already_applied'
            ? j.skipReason ||
              (j.status === 'already_applied' ? 'Already applied' : '')
            : '';
        return `
      <div class="job-row ${j.status}" title="${escapeHtml(
          reason || `${j.title} · ${j.company}`
        )}">
        <span class="job-check ${j.status}" aria-hidden="true">${statusMark(
          j.status
        )}</span>
        <div>
          <div class="job-title">${escapeHtml(j.title)}</div>
          <div class="job-company">${escapeHtml(j.company)}</div>
          ${
            reason
              ? `<div class="job-reason">${escapeHtml(reason)}</div>`
              : ''
          }
        </div>
        <span class="job-badge ${j.status}">${statusLabel(j.status)}</span>
      </div>`;
      })
      .join('');
  }

  function render(logs: CopilotLogEntry[], state: CopilotState) {
    matchedEl.textContent = String(state.matched || 0);
    appliedEl.textContent = String(state.applied || 0);
    skippedEl.textContent = String(state.skipped || 0);
    keywordEl.textContent = state.keyword ? `“${state.keyword}”` : '';

    root.classList.toggle('is-running', Boolean(state.running && !state.paused));
    root.classList.toggle('is-paused', Boolean(state.running && state.paused));

    if (!state.running) {
      statusLabelEl.textContent = 'Idle — press Start';
    } else if (state.paused) {
      statusLabelEl.textContent = state.needsLogin
        ? 'Paused — login needed'
        : 'Paused';
    } else {
      statusLabelEl.textContent = 'Browsing Naukri…';
    }

    if (state.running && state.currentTitle) {
      nowEl.classList.add('show');
      nowEl.innerHTML = `<strong>Now</strong>${escapeHtml(state.currentTitle)}`;
    } else {
      nowEl.classList.remove('show');
      nowEl.textContent = '';
    }

    bgToggle.checked = Boolean(state.runInBackground);
    startBtn.textContent = state.running ? 'Running' : 'Start';
    startBtn.disabled = state.running && !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    pauseBtn.disabled = !state.running;
    stopBtn.disabled = !state.running;

    renderJobs(state.scannedJobs ?? []);

    if (state.toast?.id) {
      showToast(state.toast);
    }

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
            ? 'Answer Naukri’s questions and save. Atlas continues when apply succeeds, or press Resume.'
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
        '<div class="atlas-empty">Press Start to browse Naukri like a human — open, apply or skip, then scroll for more.</div>';
      return;
    }
    logEl.innerHTML = logs
      .slice(0, 24)
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
      message?.type === 'COPILOT_ALERT' ||
      message?.type === 'COPILOT_TOAST'
    ) {
      if (message?.type === 'COPILOT_TOAST' && message.toast) {
        showToast(message.toast as CopilotToast);
      }
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
