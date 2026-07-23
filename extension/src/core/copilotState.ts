export type CopilotLogLevel = 'info' | 'success' | 'warn' | 'error';

export type CopilotAlertKind =
  | 'plan_limit'
  | 'rate_limit'
  | 'login'
  | 'questions'
  | 'blocked'
  | 'error'
  | 'generic';

export type CopilotAlert = {
  message: string;
  level: 'warn' | 'error' | 'info';
  kind: CopilotAlertKind;
  at: string;
};

export type CopilotToast = {
  id: string;
  title: string;
  message: string;
  at: string;
};

export type CopilotLogEntry = {
  id: string;
  at: string;
  level: CopilotLogLevel;
  message: string;
};

export type ScannedJobStatus =
  | 'pending'
  | 'applying'
  | 'applied'
  | 'skipped'
  | 'already_applied';

export type ScannedJobItem = {
  id: string;
  title: string;
  company: string;
  url: string;
  externalJobId?: string;
  status: ScannedJobStatus;
  skipReason?: string;
};

export type SessionCompletePrompt = {
  applied: number;
  matched: number;
  skipped: number;
  at: string;
};

export type LoginPauseReason = 'loggedOut' | 'uncertain';

export type CopilotState = {
  running: boolean;
  paused: boolean;
  runInBackground: boolean;
  needsLogin: boolean;
  /** Why we paused for login — drives confirm vs log-in copy. */
  loginPauseReason?: LoginPauseReason | null;
  keyword: string;
  matched: number;
  applied: number;
  skipped: number;
  appliesThisSession: number;
  stealthAppliesThisSession: number;
  stealthStartedAt?: string | null;
  sessionBreakUntil?: string | null;
  sessionBreakRemainingMs?: number | null;
  /** Human-pace wait shown to the user (e.g. "Reading JD"). */
  paceLabel?: string | null;
  paceRemainingMs?: number | null;
  /** Shown when a browse session finishes — next page vs close. */
  sessionComplete?: SessionCompletePrompt | null;
  currentTitle?: string;
  lastMessage?: string;
  alert?: CopilotAlert | null;
  /** Short-lived success toast for apply events. */
  toast?: CopilotToast | null;
  /** Jobs discovered on the search list (human-like browse flow). */
  scannedJobs: ScannedJobItem[];
};

const LOG_KEY = 'copilotLogs';
const STATE_KEY = 'copilotState';
const MAX_LOGS = 80;
const MAX_SCANNED = 120;

export const DEFAULT_COPILOT_STATE: CopilotState = {
  running: false,
  paused: false,
  runInBackground: false,
  needsLogin: false,
  loginPauseReason: null,
  keyword: '',
  matched: 0,
  applied: 0,
  skipped: 0,
  appliesThisSession: 0,
  stealthAppliesThisSession: 0,
  stealthStartedAt: null,
  sessionBreakUntil: null,
  sessionBreakRemainingMs: null,
  paceLabel: null,
  paceRemainingMs: null,
  sessionComplete: null,
  alert: null,
  toast: null,
  scannedJobs: [],
};

export async function getCopilotState(): Promise<CopilotState> {
  const data = await chrome.storage.local.get(STATE_KEY);
  return {
    ...DEFAULT_COPILOT_STATE,
    ...((data[STATE_KEY] as CopilotState | undefined) ?? {}),
    scannedJobs:
      (data[STATE_KEY] as CopilotState | undefined)?.scannedJobs ?? [],
  };
}

function countsFromJobs(jobs: ScannedJobItem[]): Pick<
  CopilotState,
  'matched' | 'applied' | 'skipped'
> {
  let applied = 0;
  let skipped = 0;
  for (const job of jobs) {
    if (job.status === 'applied') applied += 1;
    else if (job.status === 'skipped' || job.status === 'already_applied') {
      skipped += 1;
    }
  }
  return { matched: jobs.length, applied, skipped };
}

/** Serialize storage writes so concurrent updates cannot clobber scannedJobs / counts. */
let stateWriteChain: Promise<unknown> = Promise.resolve();

async function commitCopilotState(
  updater: (current: CopilotState) => Partial<CopilotState>
): Promise<CopilotState> {
  const run = async () => {
    const current = await getCopilotState();
    const partial = updater(current);
    const next: CopilotState = { ...current, ...partial };
    if (partial.scannedJobs) {
      Object.assign(next, countsFromJobs(partial.scannedJobs));
    }
    await chrome.storage.local.set({ [STATE_KEY]: next });
    return next;
  };

  const result = stateWriteChain.then(run, run);
  stateWriteChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function setCopilotState(
  partial: Partial<CopilotState>
): Promise<CopilotState> {
  return commitCopilotState(() => partial);
}

export function jobKey(job: {
  externalJobId?: string;
  url: string;
}): string {
  return job.externalJobId || job.url;
}

export async function upsertScannedJobs(
  jobs: Omit<ScannedJobItem, 'status'>[],
  status: ScannedJobStatus = 'pending'
): Promise<ScannedJobItem[]> {
  const next = await commitCopilotState((state) => {
    const byId = new Map(state.scannedJobs.map((j) => [j.id, j]));
    for (const job of jobs) {
      if (!byId.has(job.id)) {
        byId.set(job.id, { ...job, status });
      }
    }
    return { scannedJobs: [...byId.values()].slice(0, MAX_SCANNED) };
  });
  return next.scannedJobs;
}

export async function updateScannedJob(
  id: string,
  patch: Partial<Pick<ScannedJobItem, 'status' | 'skipReason' | 'title'>>
): Promise<void> {
  await commitCopilotState((state) => ({
    scannedJobs: state.scannedJobs.map((j) =>
      j.id === id ? { ...j, ...patch } : j
    ),
  }));
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
  if (/hourly safety limit|hourly apply limit/.test(m)) return 'rate_limit';
  if (/daily safety limit|daily apply limit/.test(m)) return 'rate_limit';
  if (/plan apply limit|monthly apply limit/.test(m)) return 'plan_limit';
  if (/naukri asked for verification|blocked|captcha|unusual activity/.test(m)) {
    return 'blocked';
  }
  if (/log into naukri|not logged into naukri|naukri login|confirm you.?re logged/i.test(m)) {
    return 'login';
  }
  if (/asking questions|waiting on naukri questions|questions still open/.test(m)) {
    return 'questions';
  }
  if (/co-pilot error|still not logged|stopping co-pilot/.test(m)) return 'error';
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
      alert.kind === 'plan_limit'
        ? 'MAX'
        : alert.kind === 'rate_limit'
          ? 'CAP'
          : alert.kind === 'blocked'
            ? 'BLK'
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
      title: `Cosmo — ${alert.message}`,
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

export async function raiseCopilotToast(
  title: string,
  message: string
): Promise<CopilotToast> {
  const toast: CopilotToast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    at: new Date().toISOString(),
  };
  await setCopilotState({ toast });
  await broadcastCopilotToNaukriTabs({ type: 'COPILOT_TOAST', toast });
  return toast;
}

export async function clearCopilotToast(): Promise<void> {
  await setCopilotState({ toast: null });
}

export async function clearCopilotAlert(): Promise<void> {
  await setCopilotState({ alert: null });
  await syncActionBadge(null);
  try {
    await chrome.action.setTitle({ title: 'Cosmo' });
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
