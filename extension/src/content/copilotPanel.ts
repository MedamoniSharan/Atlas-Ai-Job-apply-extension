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
import { cosmosLogoSvg } from '../shared/cosmosLogo';

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

function statusLabel(
  status: ScannedJobItem['status'],
  skipReason?: string
): string {
  switch (status) {
    case 'pending':
      return 'Queued';
    case 'applying':
      return 'Opening';
    case 'applied':
      return 'Applied';
    case 'already_applied':
      return 'Already';
    case 'skipped':
      return /company site/i.test(skipReason || '') ? 'Manual' : 'Skipped';
    default:
      return status;
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
        --atlas-bg: #f4f4f5;
        --atlas-panel: #ffffff;
        --atlas-elevated: #f4f4f5;
        --atlas-line: #e4e4e7;
        --atlas-text: #18181b;
        --atlas-muted: #71717a;
        --atlas-accent: #18181b;
        --atlas-accent-ink: #ffffff;
        --atlas-dim: rgba(24,24,27,.06);
        --atlas-warn: #b45309;
        --atlas-danger: #b91c1c;
        --atlas-success: #15803d;
        --atlas-skip: #a16207;
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
        background: var(--atlas-panel);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line);
        border-radius: 16px;
        box-shadow:
          0 18px 40px rgba(24,24,27,.14),
          0 0 0 1px rgba(24,24,27,.04);
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
        flex: 1 1 auto;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      #${ROOT_ID} .atlas-brand:active {
        cursor: grabbing;
      }
      #${ROOT_ID}.is-dragging .atlas-brand {
        cursor: grabbing;
      }
      #${ROOT_ID}.is-dragging .atlas-panel {
        box-shadow:
          0 22px 48px rgba(24,24,27,.22),
          0 0 0 1px rgba(24,24,27,.06);
      }
      #${ROOT_ID} .atlas-brand .atlas-cosmos-logo {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        color: var(--atlas-text);
        transform-box: fill-box;
        transform-origin: center;
        transition: color .2s ease;
      }
      #${ROOT_ID}.is-running .atlas-brand .atlas-cosmos-logo {
        animation: atlas-logo-spin 1.6s ease-in-out infinite;
      }
      #${ROOT_ID}.is-paused .atlas-brand .atlas-cosmos-logo {
        color: var(--atlas-text);
        animation: none;
      }
      #${ROOT_ID}:not(.is-running) .atlas-brand:hover .atlas-cosmos-logo {
        animation: atlas-logo-hover 1.2s ease-in-out infinite;
      }
      @keyframes atlas-logo-spin {
        0%, 100% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.08) rotate(180deg); }
      }
      @keyframes atlas-logo-hover {
        0% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.2) rotate(180deg); }
        100% { transform: scale(1) rotate(360deg); }
      }
      #${ROOT_ID} .atlas-brand-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
        flex: 1 1 auto;
      }
      #${ROOT_ID} .atlas-brand-text {
        font-weight: 750;
        font-size: 12px;
        letter-spacing: 0.04em;
        line-height: 1.15;
        color: #18181b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .atlas-brand-sub {
        font-size: 10px;
        color: var(--atlas-muted);
        letter-spacing: 0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .atlas-actions {
        display: flex;
        gap: 5px;
        align-items: center;
        flex-shrink: 0;
        max-width: 58%;
      }
      #${ROOT_ID} .atlas-actions-run {
        display: flex;
        gap: 4px;
        align-items: center;
        min-width: 0;
      }
      #${ROOT_ID} button {
        border: 0;
        border-radius: 9px;
        padding: 6px 9px;
        font-size: 11px;
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
      #${ROOT_ID} .btn-start {
        background: #16a34a;
        color: #ffffff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 0;
        padding-left: 8px;
        padding-right: 8px;
      }
      #${ROOT_ID} .btn-start:disabled {
        background: #86efac;
        color: #14532d;
        opacity: 1;
      }
      #${ROOT_ID} .btn-start.is-running {
        background: #16a34a;
        color: #ffffff;
      }
      #${ROOT_ID} .btn-start .run-anim {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        overflow: hidden;
      }
      #${ROOT_ID} .btn-start .run-anim svg {
        width: 16px;
        height: 16px;
        display: block;
        animation: atlas-runner-cycle 0.45s ease-in-out infinite;
      }
      #${ROOT_ID} .btn-start .run-label {
        display: inline-flex;
        align-items: baseline;
      }
      #${ROOT_ID} .btn-start .run-dots {
        display: inline-flex;
        width: 1.1em;
        letter-spacing: 0.02em;
      }
      #${ROOT_ID} .btn-start .run-dots i {
        font-style: normal;
        opacity: 0;
        animation: atlas-run-dot 1.2s infinite;
      }
      #${ROOT_ID} .btn-start .run-dots i:nth-child(1) { animation-delay: 0s; }
      #${ROOT_ID} .btn-start .run-dots i:nth-child(2) { animation-delay: 0.2s; }
      #${ROOT_ID} .btn-start .run-dots i:nth-child(3) { animation-delay: 0.4s; }
      @keyframes atlas-runner-cycle {
        0% { transform: translateX(0) translateY(0) rotate(-8deg); }
        50% { transform: translateX(1.5px) translateY(-1.5px) rotate(8deg); }
        100% { transform: translateX(0) translateY(0) rotate(-8deg); }
      }
      @keyframes atlas-run-dot {
        0%, 20% { opacity: 0; }
        40%, 100% { opacity: 1; }
      }
      #${ROOT_ID} .btn-pause {
        background: #fef3c7;
        color: #92400e;
        border: 1px solid #fcd34d !important;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        font-size: 13px;
        line-height: 1;
      }
      #${ROOT_ID} .btn-stop {
        background: #fee2e2;
        color: #991b1b;
        border: 1px solid #fca5a5 !important;
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        font-size: 14px;
        line-height: 1;
      }
      #${ROOT_ID} .btn-icon {
        width: 30px;
        height: 30px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        background: #eff6ff;
        color: #1d4ed8;
        border: 1px solid #bfdbfe !important;
        border-radius: 9px;
        font-size: 15px;
        line-height: 1;
        transition: color .15s ease, border-color .15s ease, background .15s ease;
      }
      #${ROOT_ID} .btn-icon:hover {
        color: #1e3a8a;
        border-color: #93c5fd !important;
        background: #dbeafe;
      }
      #${ROOT_ID} .atlas-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 0 12px 10px;
      }
      #${ROOT_ID} .stat {
        background: #f4f4f5;
        border: 1px solid #e4e4e7;
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
      #${ROOT_ID} .stat--applied .stat-n { color: var(--atlas-success); }
      #${ROOT_ID} .stat--skipped .stat-n { color: var(--atlas-skip); }
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
        accent-color: var(--atlas-accent);
        width: 13px;
        height: 13px;
      }
      #${ROOT_ID} .atlas-now {
        display: none;
        margin: 0 12px 10px;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--atlas-dim);
        border: 1px solid var(--atlas-line);
        font-size: 12px;
        line-height: 1.35;
        color: var(--atlas-text);
      }
      #${ROOT_ID} .atlas-now.show { display: block; }
      #${ROOT_ID} .atlas-now strong {
        display: block;
        font-size: 10px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--atlas-muted);
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
        padding: 0 8px 8px;
        display: grid;
        gap: 4px;
        max-height: 210px;
        scrollbar-width: thin;
        scrollbar-color: #d4d4d8 transparent;
      }
      #${ROOT_ID} .job-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 8px 9px;
        border-radius: 10px;
        background: #fafafa;
        border: 1px solid #ececef;
        font-size: 12px;
        line-height: 1.3;
        transition: background .15s ease, border-color .15s ease;
      }
      #${ROOT_ID} .job-row:hover {
        background: #f4f4f5;
        border-color: #e4e4e7;
      }
      #${ROOT_ID} .job-row.applying {
        background: var(--atlas-dim);
        border-color: var(--atlas-line);
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
      #${ROOT_ID} .job-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 3px 7px;
        border-radius: 999px;
        white-space: nowrap;
        background: var(--atlas-elevated);
        color: var(--atlas-muted);
      }
      #${ROOT_ID} .job-badge.pending { background: rgba(37,99,235,.12); color: #1d4ed8; }
      #${ROOT_ID} .job-badge.applied { background: rgba(22,163,74,.14); color: var(--atlas-success); }
      #${ROOT_ID} .job-badge.skipped,
      #${ROOT_ID} .job-badge.already_applied { background: rgba(202,138,4,.16); color: var(--atlas-skip); }
      #${ROOT_ID} .job-badge.applying { background: rgba(37,99,235,.12); color: #1d4ed8; }
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
        scrollbar-color: #d4d4d8 transparent;
      }
      #${ROOT_ID} .log-row {
        display: grid;
        grid-template-columns: 42px 1fr;
        gap: 8px;
        font-size: 11px;
        line-height: 1.35;
        padding: 5px 8px;
        border-radius: 8px;
        color: #18181b;
      }
      #${ROOT_ID} .log-row.success { color: var(--atlas-success); font-weight: 600; }
      #${ROOT_ID} .log-row.warn { color: var(--atlas-warn); }
      #${ROOT_ID} .log-row.error { color: var(--atlas-danger); }
      #${ROOT_ID} .log-time {
        color: #18181b;
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
        background: var(--atlas-elevated);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line);
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
        border-radius: 18px;
      }
      #${ROOT_ID}.collapsed .atlas-actions-run,
      #${ROOT_ID}.collapsed .atlas-brand-copy,
      #${ROOT_ID}.collapsed .atlas-stats,
      #${ROOT_ID}.collapsed .atlas-meta,
      #${ROOT_ID}.collapsed .atlas-now,
      #${ROOT_ID}.collapsed .atlas-section,
      #${ROOT_ID}.collapsed .atlas-log-wrap,
      #${ROOT_ID}.collapsed .atlas-notice,
      #${ROOT_ID}.collapsed .atlas-modal,
      #${ROOT_ID}.collapsed #atlas-minimize { display: none !important; }
      #${ROOT_ID}.collapsed .atlas-head {
        padding: 14px 16px;
        gap: 0;
        cursor: grab;
        user-select: none;
        touch-action: none;
      }
      #${ROOT_ID}.collapsed .atlas-head:active {
        cursor: grabbing;
      }
      #${ROOT_ID}.collapsed .atlas-actions {
        display: none !important;
      }
      #${ROOT_ID}.collapsed .atlas-brand {
        pointer-events: none;
      }
      #${ROOT_ID}.collapsed .atlas-brand .atlas-cosmos-logo {
        color: #18181b;
        width: 36px;
        height: 36px;
        transition: transform 0.2s ease;
      }
      #${ROOT_ID}.collapsed .atlas-head:hover .atlas-cosmos-logo {
        animation: atlas-logo-hover 1s ease-in-out infinite;
      }
      #${ROOT_ID}.collapsed.is-dragging .atlas-head {
        cursor: grabbing;
      }
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
        box-shadow: 0 16px 40px rgba(24,24,27,.16);
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
        background: var(--atlas-accent);
        color: var(--atlas-accent-ink);
        width: 100%;
        padding: 10px 12px;
      }
      #${ROOT_ID} .btn-resume-login {
        background: var(--atlas-elevated);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line) !important;
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
        background: var(--atlas-panel);
        color: var(--atlas-text);
        border: 1px solid var(--atlas-line);
        box-shadow:
          0 16px 36px rgba(24,24,27,.16),
          0 0 0 1px rgba(24,24,27,.04);
        animation: atlas-toast-in .28s ease-out;
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
        background: rgba(22,163,74,.12);
        color: var(--atlas-success);
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
        margin-top: 1px;
      }
      #${ROOT_ID} .atlas-toast-copy {
        min-width: 0;
      }
      #${ROOT_ID} .atlas-toast-title {
        margin: 0;
        font-size: 13px;
        font-weight: 750;
        color: var(--atlas-text);
        line-height: 1.25;
      }
      #${ROOT_ID} .atlas-toast-msg {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--atlas-muted);
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
        color: var(--atlas-muted);
        border: 0 !important;
        font-size: 14px;
        line-height: 1;
      }
      #${ROOT_ID} .atlas-toast-close:hover {
        color: var(--atlas-text);
        background: rgba(24,24,27,.06);
      }
      #${ROOT_ID}.collapsed .atlas-toast-host { display: grid !important; }
    </style>
    <div class="atlas-toast-host" id="atlas-toast-host" aria-live="polite"></div>
    <div class="atlas-dock">
    <div class="atlas-panel">
      <div class="atlas-head">
        <div class="atlas-brand">
          ${cosmosLogoSvg(22, 'atlas-cosmos-logo')}
          <div class="atlas-brand-copy">
            <span class="atlas-brand-text">COSMO CO-PILOT</span>
            <span class="atlas-brand-sub" id="atlas-status-label">Idle — press Start</span>
          </div>
        </div>
        <div class="atlas-actions">
          <div class="atlas-actions-run">
            <button type="button" class="btn-start" id="atlas-start">Start</button>
            <button type="button" class="btn-pause" id="atlas-pause" title="Pause" aria-label="Pause">⏸</button>
            <button type="button" class="btn-stop" id="atlas-stop" title="Stop" aria-label="Stop">■</button>
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
          <span>Scanned jobs</span>
          <span id="atlas-jobs-count">0</span>
        </div>
        <div class="atlas-jobs" id="atlas-jobs">
          <div class="atlas-empty">Matched jobs will appear here as Atlas scans the list.</div>
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
  const DOCK_POS_KEY = 'atlas_copilot_dock_pos';
  const dockEl = root.querySelector('.atlas-dock') as HTMLElement;
  const headEl = root.querySelector('.atlas-head') as HTMLElement;

  function clampDockPosition(left: number, top: number) {
    const width = dockEl.offsetWidth || 64;
    const height = dockEl.offsetHeight || 64;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    return {
      left: Math.min(Math.max(8, left), maxLeft),
      top: Math.min(Math.max(8, top), maxTop),
    };
  }

  function applyDockPosition(left: number, top: number) {
    const next = clampDockPosition(left, top);
    dockEl.style.left = `${next.left}px`;
    dockEl.style.top = `${next.top}px`;
    dockEl.style.right = 'auto';
    dockEl.style.bottom = 'auto';
    return next;
  }

  function saveDockPosition(left: number, top: number) {
    try {
      sessionStorage.setItem(
        DOCK_POS_KEY,
        JSON.stringify({ left, top })
      );
    } catch {
      /* ignore */
    }
  }

  function restoreDockPosition() {
    try {
      const raw = sessionStorage.getItem(DOCK_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { left?: number; top?: number };
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        applyDockPosition(parsed.left, parsed.top);
      }
    } catch {
      /* ignore */
    }
  }

  restoreDockPosition();
  window.addEventListener('resize', () => {
    const left = parseFloat(dockEl.style.left || '');
    const top = parseFloat(dockEl.style.top || '');
    if (Number.isFinite(left) && Number.isFinite(top)) {
      applyDockPosition(left, top);
    }
  });

  let dragMoved = false;
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStartX = 0;
  let dragStartY = 0;

  function beginDockDrag(event: PointerEvent, captureEl: HTMLElement) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, input, a, label')) {
      return;
    }
    dragging = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    const rect = dockEl.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    root.classList.add('is-dragging');
    captureEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  headEl.addEventListener('pointerdown', (event) => {
    // Collapsed: drag from anywhere on the head. Expanded: drag from brand only
    // so Start / Pause / Stop / minimize stay clickable.
    if (root.classList.contains('collapsed')) {
      beginDockDrag(event, headEl);
      return;
    }
    if (!(event.target as HTMLElement).closest('.atlas-brand')) return;
    beginDockDrag(event, headEl);
  });

  headEl.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    const next = applyDockPosition(
      event.clientX - dragOffsetX,
      event.clientY - dragOffsetY
    );
    saveDockPosition(next.left, next.top);
  });

  function endDrag(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    try {
      headEl.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  headEl.addEventListener('pointerup', endDrag);
  headEl.addEventListener('pointercancel', endDrag);
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
    el.className = 'atlas-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="atlas-toast-icon" aria-hidden="true">✓</div>
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
    minimizeBtn.textContent = '−';
    minimizeBtn.title = 'Minimize';
    minimizeBtn.setAttribute('aria-label', 'Minimize co-pilot');
    headEl.setAttribute(
      'title',
      collapsed
        ? 'Drag to move · Click to open Cosmo Co-Pilot'
        : 'Drag the Cosmo logo/title to move'
    );
    try {
      sessionStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    // Keep the panel on-screen after size changes (collapsed ↔ expanded).
    requestAnimationFrame(() => {
      const left = parseFloat(dockEl.style.left || '');
      const top = parseFloat(dockEl.style.top || '');
      if (Number.isFinite(left) && Number.isFinite(top)) {
        const next = applyDockPosition(left, top);
        saveDockPosition(next.left, next.top);
      }
    });
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
    jobsCountEl.textContent = String(jobs.length);
    if (!jobs.length) {
      jobsEl.innerHTML =
        '<div class="atlas-empty">Matched jobs will appear here as Atlas scans the list.</div>';
      return;
    }
    const order: Record<ScannedJobItem['status'], number> = {
      applying: 0,
      pending: 1,
      applied: 2,
      already_applied: 3,
      skipped: 4,
    };
    const sorted = [...jobs].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    );
    jobsEl.innerHTML = sorted
      .slice(0, 50)
      .map(
        (j) => `
      <div class="job-row ${j.status}" title="${escapeHtml(j.skipReason || `${j.title} · ${j.company}`)}">
        <div>
          <div class="job-title">${escapeHtml(j.title)}</div>
          <div class="job-company">${escapeHtml(j.company)}</div>
        </div>
        <span class="job-badge ${j.status}">${statusLabel(j.status, j.skipReason)}</span>
      </div>`
      )
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
    const isActivelyRunning = Boolean(state.running && !state.paused);
    startBtn.classList.toggle('is-running', isActivelyRunning);
    if (isActivelyRunning) {
      startBtn.innerHTML = `
        <span class="run-anim" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="14" cy="4" r="2.2"/>
            <path d="M10.2 8.2c.7-.9 1.8-1.4 3-1.4h1.1l2.4 3.2c.3.4.2 1-.2 1.3l-2.1 1.5v2.8l3.4 4.2c.3.4.3 1-.2 1.3-.4.3-1 .3-1.3-.2L12.4 16l-2.2 1.7-1.6 4.1c-.2.5-.7.7-1.2.5-.5-.2-.7-.7-.5-1.2l1.8-4.5 2.1-1.6V12L8.8 10.4 6.9 13c-.3.5-.9.6-1.4.3-.5-.3-.6-.9-.3-1.4l2.4-3.5c.4-.6 1-.9 1.6-1.2z"/>
          </svg>
        </span>
        <span class="run-label">Running<span class="run-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
      `;
    } else {
      startBtn.textContent = state.running ? 'Running' : 'Start';
    }
    startBtn.disabled = state.running && !state.paused;
    if (state.paused) {
      pauseBtn.textContent = '▶';
      pauseBtn.title = 'Resume';
      pauseBtn.setAttribute('aria-label', 'Resume');
    } else {
      pauseBtn.textContent = '⏸';
      pauseBtn.title = 'Pause';
      pauseBtn.setAttribute('aria-label', 'Pause');
    }
    pauseBtn.disabled = !state.running;
    stopBtn.disabled = !state.running;

    renderJobs(state.scannedJobs ?? []);

    if (state.toast?.id) {
      showToast(state.toast);
    }

    const alert = state.alert;
    const waitingOnLogin =
      state.needsLogin ||
      (state.paused &&
        (alert?.kind === 'login' ||
          /log into naukri|not logged into naukri|naukri login|login to continue/i.test(
            state.lastMessage || logs[0]?.message || ''
          )));
    const waitingOnQuestions =
      state.paused &&
      !waitingOnLogin &&
      (alert?.kind === 'questions' ||
        /question/i.test(state.lastMessage || logs[0]?.message || ''));
    const planLimit =
      alert?.kind === 'plan_limit' ||
      /plan apply limit|monthly apply limit/i.test(
        alert?.message || state.lastMessage || ''
      );

    showLoginModal(Boolean(waitingOnLogin));

    const showNotice =
      waitingOnLogin ||
      waitingOnQuestions ||
      planLimit ||
      (Boolean(alert?.message) &&
        (state.paused || alert?.kind === 'plan_limit' || alert?.level === 'error'));

    if (showNotice) {
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
    setCollapsed(true);
  });

  root.querySelector('.atlas-head')?.addEventListener('click', (event) => {
    if (!root.classList.contains('collapsed')) return;
    if ((event.target as HTMLElement).closest('button')) return;
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    setCollapsed(false);
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

  window.addEventListener('pageshow', () => {
    void refresh();
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
