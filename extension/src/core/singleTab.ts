/**
 * Strict single-tab policy for Cosmo automation.
 * Reuse one Naukri work tab; never open a second work tab.
 * Close child tabs spawned by target=_blank / window.open while co-pilot runs.
 */

import { getCopilotState } from './copilotState';

let activeWorkTabId: number | null = null;
/** Tabs Cosmo intentionally opened (legacy allow-list; prefer zero extras). */
const allowedExtraTabIds = new Set<number>();
let guardInstalled = false;

export function getActiveWorkTabId(): number | null {
  return activeWorkTabId;
}

export function setActiveWorkTabId(tabId: number | null): void {
  activeWorkTabId = tabId;
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
  const tabs = await chrome.tabs.query({ url: NAUKRI_TAB_URLS });
  for (const tab of tabs) {
    if (tab.id == null) continue;
    if (keepTabId != null && tab.id === keepTabId) continue;
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

  if (activeWorkTabId != null) {
    try {
      const existing = await chrome.tabs.get(activeWorkTabId);
      if (existing.id != null) {
        await chrome.tabs.update(existing.id, {
          url: opts.url,
          active: opts.active,
        });
        await closeExtraNaukriTabs(existing.id);
        return chrome.tabs.get(existing.id);
      }
    } catch {
      activeWorkTabId = null;
    }
  }

  const naukriTabs = await chrome.tabs.query({ url: NAUKRI_TAB_URLS });
  const reusable = naukriTabs.find((t) => t.id != null);
  if (reusable?.id != null) {
    activeWorkTabId = reusable.id;
    await chrome.tabs.update(reusable.id, {
      url: opts.url,
      active: opts.active,
    });
    await closeExtraNaukriTabs(reusable.id);
    return chrome.tabs.get(reusable.id);
  }

  const created = await chrome.tabs.create({
    url: opts.url,
    active: opts.active,
  });
  activeWorkTabId = created.id ?? null;
  return created;
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
