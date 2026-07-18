import {
  CopilotLogEntry,
  CopilotState,
  DEFAULT_COPILOT_STATE,
  LOG_KEY,
  STATE_KEY,
  getCopilotLogs,
  getCopilotState,
} from '../core/copilotState';

const ROOT_ID = 'atlas-copilot-root';

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
      }
      #${ROOT_ID} .atlas-brand span.dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #2bb0a6;
        box-shadow: 0 0 0 3px rgba(43,176,166,.2);
      }
      #${ROOT_ID} .atlas-actions { display: flex; gap: 6px; align-items: center; }
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
      #${ROOT_ID} .atlas-empty { color: #6f8499; font-size: 12px; padding: 8px; }
      #${ROOT_ID}.collapsed .atlas-log,
      #${ROOT_ID}.collapsed .atlas-meta,
      #${ROOT_ID}.collapsed .atlas-notice { display: none; }
    </style>
    <div class="atlas-panel">
      <div class="atlas-head">
        <div class="atlas-brand"><span class="dot"></span> ATLAS CO-PILOT</div>
        <div class="atlas-actions">
          <button type="button" class="btn-start" id="atlas-start">Start</button>
          <button type="button" class="btn-pause" id="atlas-pause">Pause</button>
          <button type="button" class="btn-stop" id="atlas-stop">Stop</button>
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
  `;
  document.documentElement.appendChild(root);

  const logEl = root.querySelector('#atlas-log') as HTMLElement;
  const statsEl = root.querySelector('#atlas-stats') as HTMLElement;
  const noticeEl = root.querySelector('#atlas-notice') as HTMLElement;
  const startBtn = root.querySelector('#atlas-start') as HTMLButtonElement;
  const pauseBtn = root.querySelector('#atlas-pause') as HTMLButtonElement;
  const stopBtn = root.querySelector('#atlas-stop') as HTMLButtonElement;
  const bgToggle = root.querySelector('#atlas-bg') as HTMLInputElement;

  function render(logs: CopilotLogEntry[], state: CopilotState) {
    statsEl.textContent = `Matched ${state.matched} · Applied ${state.applied}${
      state.skipped ? ` · Skipped ${state.skipped}` : ''
    }`;
    bgToggle.checked = Boolean(state.runInBackground);
    startBtn.textContent = state.running ? 'Running…' : 'Start';
    startBtn.disabled = state.running && !state.paused;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    pauseBtn.disabled = !state.running;

    const waitingOnQuestions =
      state.paused &&
      /question/i.test(state.lastMessage || logs[0]?.message || '');
    const waitingOnLogin =
      state.paused &&
      /not logged into naukri|log into naukri|naukri login/i.test(
        state.lastMessage || logs[0]?.message || ''
      );
    if (waitingOnLogin) {
      noticeEl.classList.add('show');
      noticeEl.textContent =
        'You are not logged into Naukri. Log in on this page, then press Resume.';
    } else if (waitingOnQuestions) {
      noticeEl.classList.add('show');
      noticeEl.textContent =
        'Naukri is asking questions. Answer them on this page, then press Resume to continue scanning.';
    } else {
      noticeEl.classList.remove('show');
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[LOG_KEY] || changes[STATE_KEY]) {
      void refresh();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'COPILOT_REFRESH') {
      void refresh();
    }
  });

  void refresh();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { DEFAULT_COPILOT_STATE };
