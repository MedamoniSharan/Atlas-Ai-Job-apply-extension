import { CONSENT_VERSION, formatBreakCountdown } from '@atlas/shared';
import {
  CopilotState,
  CopilotToast,
  DEFAULT_COPILOT_STATE,
  STATE_KEY,
  ScannedJobItem,
  clearCopilotToast,
  getCopilotState,
} from '../core/copilotState';
import { NaukriAdapter } from '../adapters/naukriAdapter';
import { cosmosLogoSvg } from '../shared/cosmosLogo';
import {
  mountMinimizeIcon,
  mountPauseIcon,
  mountPlayIcon,
  mountStopIcon,
  runningVideoHtml,
} from '../shared/actionIcons';

const ROOT_ID = 'atlas-copilot-root';
const naukri = new NaukriAdapter();
const NAUKRI_LOGIN_URL = 'https://www.naukri.com/nlogin/login';

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
        width: 400px;
      }
      #${ROOT_ID} .atlas-panel {
        width: 100%;
        max-height: min(600px, calc(100vh - 32px));
        display: grid;
        grid-template-rows: auto auto auto auto auto auto minmax(0, 1fr) auto;
        grid-template-areas:
          "head"
          "stats"
          "meta"
          "safety"
          "now"
          "notice"
          "jobs"
          "footer";
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
      #${ROOT_ID} .atlas-head { grid-area: head; }
      #${ROOT_ID} .atlas-stats { grid-area: stats; }
      #${ROOT_ID} .atlas-meta { grid-area: meta; }
      #${ROOT_ID} .atlas-safety { grid-area: safety; }
      #${ROOT_ID} .atlas-now { grid-area: now; }
      #${ROOT_ID} .atlas-notice { grid-area: notice; }
      #${ROOT_ID} .atlas-section { grid-area: jobs; }
      #${ROOT_ID} .atlas-footer { grid-area: footer; }
      @keyframes atlas-panel-in {
        from { opacity: 0; transform: translateY(10px) scale(.98); }
        to { opacity: 1; transform: none; }
      }
      #${ROOT_ID} .atlas-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px 8px;
      }
      #${ROOT_ID} .atlas-brand {
        display: flex;
        align-items: center;
        gap: 8px;
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
        gap: 4px;
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
        padding: 6px 10px;
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
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        overflow: hidden;
        border-radius: 50%;
        background: #ffffff;
      }
      #${ROOT_ID} .btn-start .run-anim svg {
        width: 16px;
        height: 16px;
        display: block;
        animation: atlas-runner-cycle 0.45s ease-in-out infinite;
      }
      #${ROOT_ID} .btn-start .run-anim--video {
        width: 22px;
        height: 22px;
      }
      #${ROOT_ID} .btn-start .run-anim--video video {
        width: 22px;
        height: 22px;
        object-fit: contain;
        display: block;
        background: #ffffff;
        border-radius: 50%;
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
      #${ROOT_ID} .btn-pause,
      #${ROOT_ID} .btn-stop {
        width: 32px;
        min-width: 32px;
        height: 32px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        line-height: 0;
        border: 0 !important;
        box-shadow: none;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
        background: transparent !important;
      }
      #${ROOT_ID} .btn-pause {
        color: #b45309;
      }
      #${ROOT_ID} .btn-stop {
        color: #b91c1c;
      }
      #${ROOT_ID} .btn-pause:not(:disabled):hover {
        background: rgba(251, 191, 36, 0.22) !important;
      }
      #${ROOT_ID} .btn-stop:not(:disabled):hover {
        background: rgba(248, 113, 113, 0.18) !important;
      }
      #${ROOT_ID} .btn-pause .atlas-fi-icon,
      #${ROOT_ID} .btn-stop .atlas-fi-icon {
        width: 18px;
        height: 18px;
        display: block;
        fill: currentColor;
      }
      #${ROOT_ID} .atlas-fi-icon {
        width: 18px;
        height: 18px;
        display: block;
        transition: transform .2s ease;
      }
      #${ROOT_ID} .btn-pause:not(:disabled):hover .atlas-fi-icon,
      #${ROOT_ID} .btn-stop:not(:disabled):hover .atlas-fi-icon,
      #${ROOT_ID} .btn-icon:not(:disabled):hover .atlas-fi-icon {
        transform: scale(1.12);
        animation: atlas-fi-bob .55s ease-in-out infinite;
      }
      @keyframes atlas-fi-bob {
        0%, 100% { transform: scale(1.08) translateY(0); }
        50% { transform: scale(1.14) translateY(-1px); }
      }
      #${ROOT_ID} .btn-icon {
        width: 32px;
        height: 32px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        background: transparent !important;
        color: #1e3a8a;
        border: 0 !important;
        box-shadow: none;
        border-radius: 9px;
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
        transition: color .15s ease, background .15s ease;
      }
      #${ROOT_ID} .btn-icon:hover {
        color: #1e3a8a;
        background: rgba(147, 197, 253, 0.28) !important;
      }
      #${ROOT_ID} .atlas-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 0 12px 8px;
      }
      #${ROOT_ID} .stat {
        background: #f4f4f5;
        border: 1px solid #e4e4e7;
        border-radius: 10px;
        padding: 7px 6px 6px;
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
        padding: 0 12px 8px;
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
        margin: 0 12px 8px;
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
        overflow: hidden;
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
        background: var(--atlas-panel);
        position: relative;
        z-index: 1;
      }
      #${ROOT_ID} .atlas-jobs {
        overflow: auto;
        padding: 0 8px 8px;
        display: grid;
        gap: 5px;
        align-content: start;
        min-height: 0;
        max-height: 220px;
        scrollbar-width: thin;
        scrollbar-color: #d4d4d8 transparent;
      }
      #${ROOT_ID} .job-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
        gap: 8px;
        align-items: center;
        padding: 8px 9px;
        border-radius: 10px;
        background: #fafafa;
        border: 1px solid #ececef;
        font-size: 12px;
        line-height: 1.3;
        transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
      }
      #${ROOT_ID} .job-row:hover {
        background: #f4f4f5;
        border-color: #e4e4e7;
      }
      #${ROOT_ID} .job-row.applying {
        background: #eff6ff;
        border-color: #93c5fd;
        box-shadow:
          0 0 0 2px rgba(37,99,235,.12),
          0 6px 16px rgba(37,99,235,.1);
        animation: atlas-job-pulse 1.8s ease-in-out infinite;
      }
      #${ROOT_ID} .job-row.applying .job-title {
        color: #1e3a8a;
      }
      @keyframes atlas-job-pulse {
        0%, 100% { box-shadow: 0 0 0 2px rgba(37,99,235,.12), 0 6px 16px rgba(37,99,235,.08); }
        50% { box-shadow: 0 0 0 3px rgba(37,99,235,.22), 0 8px 18px rgba(37,99,235,.14); }
      }
      #${ROOT_ID} .job-title {
        font-weight: 650;
        font-size: 12px;
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
        flex-shrink: 0;
        min-width: max-content;
        max-width: none;
        overflow: visible;
        background: var(--atlas-elevated);
        color: var(--atlas-muted);
      }
      #${ROOT_ID} .job-badge.pending {
        background: rgba(124, 58, 237, 0.12);
        color: #6d28d9;
      }
      #${ROOT_ID} .job-badge.applied { background: rgba(22,163,74,.14); color: var(--atlas-success); }
      #${ROOT_ID} .job-badge.skipped,
      #${ROOT_ID} .job-badge.already_applied { background: rgba(202,138,4,.16); color: var(--atlas-skip); }
      #${ROOT_ID} .job-badge.applying {
        background: #2563eb;
        color: #ffffff;
        box-shadow: 0 0 0 1px rgba(37,99,235,.25);
      }
      #${ROOT_ID} .atlas-notice {
        display: none;
        margin: 0 12px 8px;
        padding: 8px 10px;
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
      #${ROOT_ID} .atlas-safety {
        margin: 0 12px 8px;
        padding: 7px 9px;
        font-size: 11px;
        font-weight: 650;
        color: #1e3a8a;
        line-height: 1.35;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 10px;
        box-shadow: 0 0 0 1px rgba(37,99,235,.06);
      }
      #${ROOT_ID} .atlas-safety.is-active {
        animation: atlas-safety-glow 2s ease-in-out infinite;
      }
      @keyframes atlas-safety-glow {
        0%, 100% { border-color: #bfdbfe; box-shadow: 0 0 0 1px rgba(37,99,235,.06); }
        50% { border-color: #93c5fd; box-shadow: 0 0 0 2px rgba(37,99,235,.14); }
      }
      @keyframes atlas-copilot-flash {
        0%, 100% { filter: brightness(1); }
        50% { filter: brightness(1.25); }
      }
      #${ROOT_ID} .atlas-empty {
        color: var(--atlas-muted);
        font-size: 12px;
        padding: 12px 10px;
        text-align: center;
        line-height: 1.45;
      }
      #${ROOT_ID} .atlas-footer {
        border-top: 1px solid var(--atlas-line);
        padding: 10px 12px 12px;
        text-align: center;
      }
      #${ROOT_ID} .atlas-footer a {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        color: var(--atlas-muted);
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.02em;
        text-decoration: none;
        text-transform: lowercase;
        transition: color .15s ease;
      }
      #${ROOT_ID} .atlas-footer a:hover {
        color: var(--atlas-text);
      }
      #${ROOT_ID} .atlas-footer img {
        display: block;
        width: 132px;
        height: auto;
      }
      #${ROOT_ID}.collapsed .atlas-dock {
        width: auto;
      }
      #${ROOT_ID}.collapsed .atlas-panel {
        width: auto;
        max-height: none;
        grid-template-rows: auto;
        grid-template-areas: "head";
        animation: none;
        border-radius: 18px;
      }
      #${ROOT_ID}.collapsed .atlas-actions-run,
      #${ROOT_ID}.collapsed .atlas-brand-copy,
      #${ROOT_ID}.collapsed .atlas-stats,
      #${ROOT_ID}.collapsed .atlas-meta,
      #${ROOT_ID}.collapsed .atlas-safety,
      #${ROOT_ID}.collapsed .atlas-now,
      #${ROOT_ID}.collapsed .atlas-section,
      #${ROOT_ID}.collapsed .atlas-footer,
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
        width: 42px;
        height: 42px;
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
        padding: 16px;
        box-shadow: 0 16px 40px rgba(24,24,27,.16);
        display: grid;
        gap: 10px;
        pointer-events: auto;
      }
      #${ROOT_ID} .atlas-modal-card h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
      }
      #${ROOT_ID} .atlas-modal-card p {
        margin: 0;
        font-size: 13px;
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
        width: min(420px, calc(100vw - 32px));
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
      #${ROOT_ID} .atlas-toast.is-pace .atlas-toast-icon {
        background: rgba(202,138,4,.14);
        color: #b45309;
        font-size: 13px;
      }
      #${ROOT_ID} .atlas-toast.is-pace {
        border-color: #fcd34d;
        background: #fffbeb;
      }
      #${ROOT_ID} .atlas-toast-countdown {
        font-variant-numeric: tabular-nums;
        font-weight: 750;
        color: #b45309;
        font-size: 13px;
        line-height: 1.2;
        margin-top: 1px;
        min-width: 2.4em;
        text-align: right;
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
            <button type="button" class="btn-pause" id="atlas-pause" title="Pause" aria-label="Pause"></button>
            <button type="button" class="btn-stop" id="atlas-stop" title="Stop" aria-label="Stop"></button>
          </div>
          <button
            type="button"
            class="btn-icon"
            id="atlas-minimize"
            title="Minimize"
            aria-label="Minimize co-pilot"
          ></button>
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
        <span id="atlas-keyword"></span>
      </div>
      <p class="atlas-safety" id="atlas-safety" aria-live="polite"></p>
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
      <footer class="atlas-footer">
        <a href="https://codexcareer.com/" target="_blank" rel="noreferrer" aria-label="powered by codexcareer">
          <img src="${chrome.runtime.getURL('assets/codexcareer-logo.png')}" alt="codexcareer" width="132" height="43" />
          <span>powered by codexcareer</span>
        </a>
      </footer>
    </div>
    <div class="atlas-modal" id="atlas-done-modal" role="dialog" aria-modal="true">
      <div class="atlas-modal-card">
        <h3 id="atlas-done-title">Applies done</h3>
        <p id="atlas-done-body">
          Session finished. Continue to the next page of jobs, or close and review on your dashboard.
        </p>
        <div class="atlas-modal-actions">
          <button type="button" class="btn-resume-login" id="atlas-done-next">
            Next page jobs
          </button>
          <button type="button" class="btn-login" id="atlas-done-close">
            Close — view dashboard
          </button>
        </div>
      </div>
    </div>
    <div class="atlas-modal" id="atlas-consent-modal" role="dialog" aria-modal="true">
      <div class="atlas-modal-card">
        <h3>Start co-pilot session</h3>
        <p>
          Cosmo will open Naukri in your browser and submit Easy Apply using your
          logged-in Naukri account. You remain responsible for applications. This
          is an assisted co-pilot — not unattended bulk apply.
        </p>
        <label class="toggle" style="margin: 10px 0 14px; display:flex; gap:8px; align-items:flex-start;">
          <input type="checkbox" id="atlas-consent-check" />
          <span>I understand applies use my Naukri account</span>
        </label>
        <div class="atlas-modal-actions">
          <button type="button" class="btn-resume-login" id="atlas-consent-start" disabled>
            Start session
          </button>
          <button type="button" class="btn-login" id="atlas-consent-cancel">
            Cancel
          </button>
        </div>
      </div>
    </div>
    <div class="atlas-modal" id="atlas-login-modal" role="dialog" aria-modal="false">
      <div class="atlas-modal-card">
        <h3 id="atlas-login-title">Log in to Naukri to continue</h3>
        <p id="atlas-login-help">
          Opens Naukri login in a new tab. After you sign in, return here and
          press Continue — Cosmo will refresh this page and resume.
        </p>
        <div class="atlas-modal-actions">
          <button type="button" class="btn-login" id="atlas-open-login">
            Open login in new tab
          </button>
          <button type="button" class="btn-resume-login" id="atlas-logged-in">
            Confirm you&apos;re logged in
          </button>
        </div>
      </div>
    </div>
    </div>
  `;
  document.documentElement.appendChild(root);

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
  const consentModal = root.querySelector('#atlas-consent-modal') as HTMLElement;
  const doneModal = root.querySelector('#atlas-done-modal') as HTMLElement;
  const doneTitle = root.querySelector('#atlas-done-title') as HTMLElement;
  const doneBody = root.querySelector('#atlas-done-body') as HTMLElement;
  const doneNextBtn = root.querySelector('#atlas-done-next') as HTMLButtonElement;
  const doneCloseBtn = root.querySelector('#atlas-done-close') as HTMLButtonElement;
  const consentCheck = root.querySelector('#atlas-consent-check') as HTMLInputElement;
  const consentStartBtn = root.querySelector('#atlas-consent-start') as HTMLButtonElement;
  const consentCancelBtn = root.querySelector('#atlas-consent-cancel') as HTMLButtonElement;
  const safetyEl = root.querySelector('#atlas-safety') as HTMLElement;
  const startBtn = root.querySelector('#atlas-start') as HTMLButtonElement;
  const pauseBtn = root.querySelector('#atlas-pause') as HTMLButtonElement;
  const stopBtn = root.querySelector('#atlas-stop') as HTMLButtonElement;
  const openLoginBtn = root.querySelector('#atlas-open-login') as HTMLButtonElement;
  const loggedInBtn = root.querySelector('#atlas-logged-in') as HTMLButtonElement;
  const loginHelp = root.querySelector('#atlas-login-help') as HTMLElement;
  const loginTitle = root.querySelector('#atlas-login-title') as HTMLElement;
  const minimizeBtn = root.querySelector('#atlas-minimize') as HTMLButtonElement;
  let pauseIconMode: 'pause' | 'play' | 'idle' | null = null;
  let startIconMode: 'idle' | 'running' | 'paused' | null = null;
  const runningMp4 = chrome.runtime.getURL('assets/running.mp4');

  mountPauseIcon(pauseBtn);
  mountStopIcon(stopBtn);
  mountMinimizeIcon(minimizeBtn);

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
  let paceToastEl: HTMLElement | null = null;
  let lastPaceLabel = '';

  function dismissToast(el: HTMLElement, clearState = true) {
    el.classList.add('is-out');
    window.setTimeout(() => {
      el.remove();
      if (paceToastEl === el) {
        paceToastEl = null;
        lastPaceLabel = '';
      }
      if (clearState && !toastHost.querySelector('.atlas-toast:not(.is-pace)')) {
        void clearCopilotToast();
      }
    }, 220);
  }

  function showToast(toast: CopilotToast) {
    if (!toast?.id || toast.id === lastToastId) return;
    lastToastId = toast.id;
    Array.from(toastHost.querySelectorAll('.atlas-toast:not(.is-pace)')).forEach(
      (n) => n.remove()
    );
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

  function showPaceToast(
    label: string,
    remainingMs: number,
    jobTitle?: string
  ) {
    const countdown = formatBreakCountdown(remainingMs);
    if (!paceToastEl || !paceToastEl.isConnected || lastPaceLabel !== label) {
      lastPaceLabel = label;
      if (paceToastEl?.isConnected) paceToastEl.remove();
      const el = document.createElement('div');
      el.className = 'atlas-toast is-pace';
      el.setAttribute('role', 'status');
      el.innerHTML = `
        <div class="atlas-toast-icon" aria-hidden="true">⏱</div>
        <div class="atlas-toast-copy">
          <p class="atlas-toast-title">Slowing down</p>
          <p class="atlas-toast-msg" data-pace-msg></p>
        </div>
        <span class="atlas-toast-countdown" data-pace-cd></span>
      `;
      toastHost.prepend(el);
      paceToastEl = el;
    }
    const msgEl = paceToastEl.querySelector('[data-pace-msg]') as HTMLElement;
    const cdEl = paceToastEl.querySelector('[data-pace-cd]') as HTMLElement;
    msgEl.textContent = jobTitle ? `${label} · ${jobTitle}` : label;
    cdEl.textContent = countdown;
  }

  function hidePaceToast() {
    if (!paceToastEl) return;
    const el = paceToastEl;
    paceToastEl = null;
    lastPaceLabel = '';
    if (el.isConnected) dismissToast(el, false);
  }

  function setCollapsed(collapsed: boolean) {
    root.classList.toggle('collapsed', collapsed);
    minimizeBtn.title = 'Minimize';
    minimizeBtn.setAttribute('aria-label', 'Minimize co-pilot');
    if (!minimizeBtn.querySelector('.atlas-fi-minimize')) {
      mountMinimizeIcon(minimizeBtn);
    }
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

  function applyLoginModalCopy(reason: 'loggedOut' | 'uncertain' | null | undefined) {
    if (reason === 'uncertain') {
      loginTitle.textContent = 'Confirm you’re logged in';
      loginHelp.textContent =
        'We couldn’t confirm your Naukri session yet. If you’re already signed in, press Confirm. Otherwise open login in a new tab first.';
      loggedInBtn.textContent = 'Confirm you’re logged in';
    } else {
      loginTitle.textContent = 'Log in to Naukri to continue';
      loginHelp.textContent =
        'Opens Naukri login in a new tab. After you sign in, return here and press Confirm — Cosmo will refresh this page and resume.';
      loggedInBtn.textContent = 'Confirm you’re logged in';
    }
  }

  function showConsentModal(show: boolean) {
    consentModal.classList.toggle('show', show);
    if (show) {
      consentCheck.checked = false;
      consentStartBtn.disabled = true;
    }
  }

  function showDoneModal(
    show: boolean,
    summary?: { applied: number; matched: number; skipped: number }
  ) {
    doneModal.classList.toggle('show', show);
    if (show && summary) {
      doneTitle.textContent =
        summary.applied > 0 ? 'Applies done' : 'Session finished';
      doneBody.textContent =
        summary.applied > 0
          ? `Applied to ${summary.applied} job(s) (matched ${summary.matched}, skipped ${summary.skipped}). Go to the next page of jobs, or close and review on your Cosmo dashboard.`
          : `Matched ${summary.matched}, skipped ${summary.skipped}. Continue to the next page, or close and visit your Cosmo dashboard.`;
    }
  }

  function loadSafetyStrip(_state: CopilotState) {
    chrome.runtime.sendMessage({ type: 'GET_APPLY_QUOTA' }, (res) => {
      if (chrome.runtime.lastError || !res?.ok || !res.quota) {
        safetyEl.textContent = 'Assisted';
        return;
      }
      const q = res.quota as {
        hourUsed: number;
        hourLimit: number;
        dayUsed: number;
        dayLimit: number;
        monthUsed: number;
        monthLimit: number;
      };
      safetyEl.textContent = `Assisted · ${q.hourUsed}/${q.hourLimit} this hour · ${q.dayUsed}/${q.dayLimit} today · ${q.monthUsed}/${q.monthLimit} this month`;
    });
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
      .map((j) => {
        return `
      <div class="job-row ${j.status}" data-job-id="${escapeHtml(j.id)}" title="${escapeHtml(j.skipReason || `${j.title} · ${j.company}`)}">
        <div>
          <div class="job-title">${escapeHtml(j.title)}</div>
          <div class="job-company">${escapeHtml(j.company)}</div>
        </div>
        <span class="job-badge ${j.status}">${statusLabel(j.status, j.skipReason)}</span>
      </div>`;
      })
      .join('');

    const currentEl = jobsEl.querySelector('.job-row.applying') as HTMLElement | null;
    currentEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function render(state: CopilotState) {
    matchedEl.textContent = String(state.matched || 0);
    appliedEl.textContent = String(state.applied || 0);
    skippedEl.textContent = String(state.skipped || 0);
    keywordEl.textContent = state.keyword ? `“${state.keyword}”` : '';

    root.classList.toggle('is-running', Boolean(state.running && !state.paused));
    root.classList.toggle('is-paused', Boolean(state.running && state.paused));

    if (
      state.sessionBreakUntil &&
      Date.parse(state.sessionBreakUntil) > Date.now()
    ) {
      statusLabelEl.textContent = `Break — resumes in ${formatBreakCountdown(
        state.sessionBreakRemainingMs ?? 0
      )}`;
    } else if (state.paceLabel && (state.paceRemainingMs ?? 0) > 0) {
      statusLabelEl.textContent = `${state.paceLabel} — ${formatBreakCountdown(
        state.paceRemainingMs ?? 0
      )}`;
    } else if (state.paused) {
      statusLabelEl.textContent = state.needsLogin
        ? state.loginPauseReason === 'uncertain'
          ? 'Paused — confirm login'
          : 'Paused — login needed'
        : 'Paused';
    } else if (state.running) {
      statusLabelEl.textContent = 'Browsing Naukri…';
    } else {
      statusLabelEl.textContent = 'Idle — press Start';
    }

    const pacing =
      Boolean(state.paceLabel) && (state.paceRemainingMs ?? 0) > 0;
    if (pacing) {
      showPaceToast(
        state.paceLabel || 'Slowing down',
        state.paceRemainingMs ?? 0,
        state.currentTitle
      );
    } else {
      hidePaceToast();
    }

    if (state.running && state.currentTitle && !pacing) {
      nowEl.classList.add('show');
      nowEl.innerHTML = `<strong>Now</strong>${escapeHtml(state.currentTitle)}`;
    } else {
      nowEl.classList.remove('show');
      nowEl.textContent = '';
    }

    const isActivelyRunning = Boolean(state.running && !state.paused);

    startBtn.style.display = '';
    startBtn.classList.toggle('is-running', isActivelyRunning);
    const nextStartMode: 'idle' | 'running' | 'paused' = isActivelyRunning
      ? 'running'
      : state.running
        ? 'paused'
        : 'idle';
    if (startIconMode !== nextStartMode) {
      startIconMode = nextStartMode;
      if (nextStartMode === 'running') {
        startBtn.innerHTML = runningVideoHtml(runningMp4);
        const video = startBtn.querySelector('video');
        if (video) {
          video.src = runningMp4;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          void video.play().catch(() => undefined);
        }
      } else {
        startBtn.textContent = nextStartMode === 'paused' ? 'Paused' : 'Start';
      }
    }
    startBtn.disabled =
      Boolean(state.running) ||
      Boolean(
        state.sessionBreakUntil &&
          Date.parse(state.sessionBreakUntil) > Date.now()
      );
    if (!stopBtn.querySelector('.atlas-fi-stop')) {
      mountStopIcon(stopBtn);
    }
    const nextPauseMode: 'pause' | 'play' | 'idle' = !state.running
      ? 'idle'
      : state.paused
        ? 'play'
        : 'pause';
    if (pauseIconMode !== nextPauseMode) {
      pauseIconMode = nextPauseMode;
      if (nextPauseMode === 'play') {
        mountPlayIcon(pauseBtn);
      } else {
        mountPauseIcon(pauseBtn);
      }
    }
    if (state.paused) {
      pauseBtn.title = 'Resume';
      pauseBtn.setAttribute('aria-label', 'Resume');
    } else {
      pauseBtn.title = 'Pause';
      pauseBtn.setAttribute('aria-label', 'Pause');
    }
    pauseBtn.disabled =
      !state.running ||
      Boolean(
        state.sessionBreakUntil &&
          Date.parse(state.sessionBreakUntil) > Date.now()
      );
    stopBtn.disabled = !state.running;

    renderJobs(state.scannedJobs ?? []);
    safetyEl.classList.toggle('is-active', Boolean(state.running));

    if (state.sessionComplete) {
      showDoneModal(true, state.sessionComplete);
      if (root.classList.contains('collapsed')) {
        setCollapsed(false);
      }
    } else {
      showDoneModal(false);
    }

    if (state.toast?.id) {
      showToast(state.toast);
    }

    const alert = state.alert;
    const waitingOnLogin =
      state.needsLogin ||
      (state.paused &&
        (alert?.kind === 'login' ||
          /log into naukri|not logged into naukri|naukri login|login to continue|confirm you.?re logged/i.test(
            state.lastMessage || ''
          )));
    const waitingOnQuestions =
      state.paused &&
      !waitingOnLogin &&
      (alert?.kind === 'questions' ||
        /question/i.test(state.lastMessage || ''));
    const planLimit =
      alert?.kind === 'plan_limit' ||
      /plan apply limit|monthly apply limit/i.test(
        alert?.message || state.lastMessage || ''
      );
    const rateLimit =
      alert?.kind === 'rate_limit' ||
      /hourly safety limit|daily safety limit/i.test(
        alert?.message || state.lastMessage || ''
      );
    const blocked =
      alert?.kind === 'blocked' ||
      /verification|block page|captcha/i.test(alert?.message || '');

    if (waitingOnLogin) {
      applyLoginModalCopy(state.loginPauseReason);
    }
    showLoginModal(Boolean(waitingOnLogin));

    const onSessionBreak =
      Boolean(state.sessionBreakUntil) &&
      Date.parse(state.sessionBreakUntil!) > Date.now();

    const showNotice =
      onSessionBreak ||
      waitingOnLogin ||
      waitingOnQuestions ||
      planLimit ||
      rateLimit ||
      blocked ||
      (Boolean(alert?.message) &&
        (state.paused ||
          alert?.kind === 'plan_limit' ||
          alert?.kind === 'rate_limit' ||
          alert?.kind === 'blocked' ||
          alert?.level === 'error'));

    if (showNotice) {
      noticeEl.classList.add('show', 'is-alert');
      noticeEl.textContent =
        onSessionBreak
          ? `Taking a 2-minute break — safer pacing. Resumes in ${formatBreakCountdown(
              state.sessionBreakRemainingMs ?? 0
            )}.`
          : alert?.message ||
        (waitingOnLogin
          ? state.loginPauseReason === 'uncertain'
            ? 'Confirm you’re logged into Naukri, then press Confirm.'
            : 'Log into Naukri in the new tab, then press Confirm here.'
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
  }

  async function refresh() {
    const state = await getCopilotState();
    render(state);
    loadSafetyStrip(state);
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
      const status = naukri.getLoginStatus(document);
      if (status !== 'loggedIn') {
        applyLoginModalCopy(status === 'loggedOut' ? 'loggedOut' : 'uncertain');
        showLoginModal(true);
        loginHelp.textContent =
          status === 'uncertain'
            ? 'Still can’t confirm login. Finish signing in, then press Confirm again.'
            : 'Still not logged in. Finish login in the other tab, then press Confirm again.';
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

  consentCheck.addEventListener('change', () => {
    consentStartBtn.disabled = !consentCheck.checked;
  });

  consentCancelBtn.addEventListener('click', () => showConsentModal(false));

  consentStartBtn.addEventListener('click', () => {
    if (!consentCheck.checked) return;
    showConsentModal(false);
    chrome.runtime.sendMessage(
      {
        type: 'COPILOT_START',
        consentAccepted: true,
        consentVersion: CONSENT_VERSION,
      },
      () => void refresh()
    );
  });

  doneNextBtn.addEventListener('click', () => {
    showDoneModal(false);
    noticeEl.classList.add('show', 'is-alert');
    noticeEl.textContent =
      'Taking a short read pause, then opening the next page of jobs…';
    chrome.runtime.sendMessage({ type: 'COPILOT_NEXT_PAGE' }, (res) => {
      if (res?.ok === false && res?.message) {
        noticeEl.textContent = res.message;
      }
      void refresh();
    });
  });

  doneCloseBtn.addEventListener('click', () => {
    showDoneModal(false);
    chrome.runtime.sendMessage({ type: 'COPILOT_SESSION_CLOSE' }, () => {
      noticeEl.classList.add('show', 'is-alert');
      noticeEl.textContent =
        'Visit your Cosmo dashboard to review applications.';
      setCollapsed(true);
      void refresh();
    });
  });

  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_SAFETY_STATUS' }, (res) => {
      if (res?.blocked) {
        noticeEl.classList.add('show', 'is-alert');
        noticeEl.textContent =
          'Naukri verification cooldown active — wait before starting a new session.';
        return;
      }
      showConsentModal(true);
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
          'Login tab opened. Sign in there — when you close it, Cosmo re-checks login. Or press Confirm here.';
      }
    );
  });

  loggedInBtn.addEventListener('click', () => {
    loggedInBtn.disabled = true;
    loggedInBtn.textContent = 'Checking…';
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
    if (changes[STATE_KEY]) {
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
      message?.type === 'LOGIN_REVERIFIED' ||
      message?.type === 'COPILOT_ALERT' ||
      message?.type === 'COPILOT_TOAST' ||
      message?.type === 'COPILOT_COLLAPSE'
    ) {
      if (message?.type === 'COPILOT_TOAST' && message.toast) {
        showToast(message.toast as CopilotToast);
      }
      if (message?.type === 'COPILOT_COLLAPSE') {
        setCollapsed(true);
      }
      if (message?.type === 'SHOW_LOGIN_PROMPT') {
        const reason =
          message.reason === 'loggedOut' || message.reason === 'uncertain'
            ? message.reason
            : 'uncertain';
        applyLoginModalCopy(reason);
        showLoginModal(true);
      }
      if (message?.type === 'LOGIN_REVERIFIED' && message.loggedIn) {
        showLoginModal(false);
      }
      void refresh();
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
