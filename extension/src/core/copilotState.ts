export type CopilotLogLevel = 'info' | 'success' | 'warn' | 'error';

export type CopilotAlertKind =
  | 'daily_limit'
  | 'login'
  | 'questions'
  | 'error'
  | 'generic';

export type CopilotAlert = {
  message: string;
  level: 'warn' | 'error' | 'info';
  kind: CopilotAlertKind;
  at: string;
};

export type CopilotLogEntry = {
  id: string;
  at: string;
  level: CopilotLogLevel;
  message: string;
};

export type CopilotState = {
  running: boolean;
  paused: boolean;
  runInBackground: boolean;
  needsLogin: boolean;
  keyword: string;
  matched: number;
  applied: number;
  skipped: number;
  currentTitle?: string;
  lastMessage?: string;
  alert?: CopilotAlert | null;
};

const LOG_KEY = 'copilotLogs';
const STATE_KEY = 'copilotState';
const MAX_LOGS = 80;

export const DEFAULT_COPILOT_STATE: CopilotState = {
  running: false,
  paused: false,
  runInBackground: false,
  needsLogin: false,
  keyword: '',
  matched: 0,
  applied: 0,
  skipped: 0,
  alert: null,
};

export async function getCopilotState(): Promise<CopilotState> {
  const data = await chrome.storage.local.get(STATE_KEY);
  return {
    ...DEFAULT_COPILOT_STATE,
    ...((data[STATE_KEY] as CopilotState | undefined) ?? {}),
  };
}

export async function setCopilotState(
  partial: Partial<CopilotState>
): Promise<CopilotState> {
  const current = await getCopilotState();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

export async function getCopilotLogs(): Promise<CopilotLogEntry[]> {
  const data = await chrome.storage.local.get(LOG_KEY);
  return (data[LOG_KEY] as CopilotLogEntry[] | undefined) ?? [];
}

export async function appendCopilotLog(
  message: string,
  level: CopilotLogLevel = 'info'
): Promise<CopilotLogEntry> {
  const entry: CopilotLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level,
    message,
  };
  const logs = await getCopilotLogs();
  const next = [entry, ...logs].slice(0, MAX_LOGS);
  await chrome.storage.local.set({ [LOG_KEY]: next });
  await setCopilotState({ lastMessage: message });

  // Surface important warnings in popup + flashing banner.
  if (level === 'warn' || level === 'error') {
    const kind = classifyAlert(message);
    if (kind) {
      await raiseCopilotAlert(message, level === 'error' ? 'error' : 'warn', kind);
    }
  }

  return entry;
}

function classifyAlert(message: string): CopilotAlertKind | null {
  const m = message.toLowerCase();
  if (/daily apply limit/.test(m)) return 'daily_limit';
  if (/log into naukri|not logged into naukri|naukri login/.test(m)) {
    return 'login';
  }
  if (/asking questions|waiting on naukri questions|questions still open/.test(m)) {
    return 'questions';
  }
  if (/bot error|still not logged|stopping bot/.test(m)) return 'error';
  if (levelLooksImportant(m)) return 'generic';
  return null;
}

function levelLooksImportant(message: string): boolean {
  return /limit reached|failed|unavailable|stopped/.test(message);
}

async function syncActionBadge(alert: CopilotAlert | null | undefined) {
  try {
    if (!alert) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const text =
      alert.kind === 'daily_limit'
        ? 'MAX'
        : alert.kind === 'login'
          ? 'IN'
          : alert.level === 'error'
            ? '!'
            : '⚠';
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({
      color: alert.level === 'error' ? '#b42318' : '#b45309',
    });
    await chrome.action.setTitle({
      title: `Atlas — ${alert.message}`,
    });
  } catch {
    /* action API may be unavailable in tests */
  }
}

export async function raiseCopilotAlert(
  message: string,
  level: CopilotAlert['level'] = 'warn',
  kind: CopilotAlertKind = 'generic'
): Promise<CopilotAlert> {
  const alert: CopilotAlert = {
    message,
    level,
    kind,
    at: new Date().toISOString(),
  };
  await setCopilotState({ alert });
  await syncActionBadge(alert);
  await broadcastCopilotToNaukriTabs({ type: 'COPILOT_ALERT', alert });
  return alert;
}

export async function clearCopilotAlert(): Promise<void> {
  await setCopilotState({ alert: null });
  await syncActionBadge(null);
  try {
    await chrome.action.setTitle({ title: 'Atlas' });
  } catch {
    /* ignore */
  }
}

export async function clearCopilotLogs(): Promise<void> {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}

export async function broadcastCopilotToNaukriTabs(
  message: unknown
): Promise<void> {
  const tabs = await chrome.tabs.query({
    url: ['https://www.naukri.com/*', 'https://naukri.com/*'],
  });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // tab may not have content script yet
      }
    })
  );
}

export { LOG_KEY, STATE_KEY };
