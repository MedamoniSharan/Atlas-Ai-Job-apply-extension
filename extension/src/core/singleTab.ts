/**
 * Strict single-tab policy for Cosmo automation.
 * Reuse one Naukri work tab; never open a second work tab.
 * Close child tabs spawned by target=_blank / window.open while co-pilot runs.
 */

import { getCopilotState } from './copilotState';

const WORK_TAB_STORAGE_KEY = 'cosmoActiveNaukriWorkTabId';

let activeWorkTabId: number | null = null;
/** Tabs Cosmo intentionally opened (legacy allow-list; prefer zero extras). */
const allowedExtraTabIds = new Set<number>();
let guardInstalled = false;
let workTabHydrated = false;

async function hydrateWorkTabId(): Promise<void> {
  if (workTabHydrated) return;
  workTabHydrated = true;
  try {
    const data = await chrome.storage.session.get(WORK_TAB_STORAGE_KEY);
    const raw = data[WORK_TAB_STORAGE_KEY];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      activeWorkTabId = raw;
    }
  } catch {
    /* session storage may be unavailable in tests */
  }
}

export function getActiveWorkTabId(): number | null {
  return activeWorkTabId;
}

export function setActiveWorkTabId(tabId: number | null): void {
  activeWorkTabId = tabId;
  void chrome.storage.session
    .set({ [WORK_TAB_STORAGE_KEY]: tabId })
    .catch(() => undefined);
}

export function allowExtraTab(tabId: number): void {
  allowedExtraTabIds.add(tabId);
}

export function clearAllowedExtraTab(tabId: number): void {
  allowedExtraTabIds.delete(tabId);
}

const NAUKRI_TAB_URLS = ['https://www.naukri.com/*', 'https://naukri.com/*'];

function isNaukriUrl(url: string | undefined): boolean {
  return Boolean(url && /naukri\.com/i.test(url));
}

/** Close every Naukri tab except the work tab (and allow-listed extras). */
export async function closeExtraNaukriTabs(
  keepTabId: number | null = activeWorkTabId
): Promise<void> {
  // Never close "everything" — if we lost the work-tab id (SW restart),
  // closing all Naukri tabs aborts the session mid-queue.
  const keep = keepTabId ?? activeWorkTabId;
  if (keep == null) return;

  const tabs = await chrome.tabs.query({ url: NAUKRI_TAB_URLS });
  for (const tab of tabs) {
    if (tab.id == null) continue;
    if (tab.id === keep) continue;
    if (allowedExtraTabIds.has(tab.id)) continue;
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      /* already closed */
    }
  }
}

/** Find an existing Naukri tab or create one — never spawn a second work tab. */
export async function ensureNaukriWorkTab(opts: {
  url: string;
  active: boolean;
}): Promise<chrome.tabs.Tab> {
  installTabSpamGuard();
  await hydrateWorkTabId();

  const navigateIfNeeded = async (tabId: number): Promise<chrome.tabs.Tab> => {
    const existing = await chrome.tabs.get(tabId);
    const cur = existing.url || '';
    if (!sameSearchIntent(cur, opts.url)) {
      await chrome.tabs.update(tabId, {
        url: opts.url,
        active: opts.active,
      });
    } else if (opts.active && !existing.active) {
      await chrome.tabs.update(tabId, { active: true });
    }
    await closeExtraNaukriTabs(tabId);
    return chrome.tabs.get(tabId);
  };

  if (activeWorkTabId != null) {
    try {
      const existing = await chrome.tabs.get(activeWorkTabId);
      if (existing.id != null) {
        return navigateIfNeeded(existing.id);
      }
    } catch {
      activeWorkTabId = null;
    }
  }

  const naukriTabs = await chrome.tabs.query({ url: NAUKRI_TAB_URLS });
  const reusable = naukriTabs.find((t) => t.id != null);
  if (reusable?.id != null) {
    activeWorkTabId = reusable.id;
    return navigateIfNeeded(reusable.id);
  }

  const created = await chrome.tabs.create({
    url: opts.url,
    active: opts.active,
  });
  activeWorkTabId = created.id ?? null;
  return created;
}

/** Keyword/location match — avoid reloading the same SRP on Start. */
function sameSearchIntent(currentUrl: string, targetUrl: string): boolean {
  try {
    const cur = new URL(currentUrl);
    const target = new URL(targetUrl);
    if (!/naukri\.com/i.test(cur.hostname)) return false;
    if (cur.origin !== target.origin) return false;
    const curPath = cur.pathname.replace(/\/$/, '');
    const targetPath = target.pathname.replace(/\/$/, '');
    if (curPath === targetPath) return true;
    const curK = (cur.searchParams.get('k') || '').trim().toLowerCase();
    const targetK = (target.searchParams.get('k') || '').trim().toLowerCase();
    const curL = (cur.searchParams.get('l') || '').trim().toLowerCase();
    const targetL = (target.searchParams.get('l') || '').trim().toLowerCase();
    return Boolean(curK && targetK && curK === targetK && curL === targetL);
  } catch {
    return false;
  }
}

async function closeIfSpamTab(tabId: number): Promise<void> {
  if (allowedExtraTabIds.has(tabId)) return;
  if (tabId === activeWorkTabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
}

function onTabCreated(tab: chrome.tabs.Tab): void {
  void (async () => {
    if (tab.id == null) return;
    if (allowedExtraTabIds.has(tab.id)) return;
    if (tab.id === activeWorkTabId) return;

    const state = await getCopilotState();
    if (!state.running || activeWorkTabId == null) return;

    // Child of the work tab (typical target=_blank / window.open spam).
    if (tab.openerTabId === activeWorkTabId) {
      await closeIfSpamTab(tab.id);
      return;
    }

    // URL / opener often populate after create — re-check and close Naukri dupes.
    const id = tab.id;
    const check = async () => {
      if (allowedExtraTabIds.has(id) || id === activeWorkTabId) return;
      try {
        const fresh = await chrome.tabs.get(id);
        if (fresh.openerTabId === activeWorkTabId || isNaukriUrl(fresh.url)) {
          await closeIfSpamTab(id);
        }
      } catch {
        /* ignore */
      }
    };
    setTimeout(() => void check(), 150);
    setTimeout(() => void check(), 500);
  })();
}

export function installTabSpamGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;
  chrome.tabs.onCreated.addListener(onTabCreated);
}
