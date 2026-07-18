export type CopilotLogLevel = 'info' | 'success' | 'warn' | 'error';

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
  return entry;
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
