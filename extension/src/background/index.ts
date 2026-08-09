import { v4 as uuidv4 } from 'uuid';
import type { EventEnvelope, EventType, JobPayload, JobPreferences } from '@cosmo/shared';
import { CONSENT_VERSION } from '@cosmo/shared';
import { enqueue } from '../core/queueManager';
import { flushQueue } from '../core/syncManager';
import { flushScanSessions } from '../core/scanSessionReporter';
import { reportHealth } from '../core/healthMonitor';
import {
  login as apiLogin,
  fetchPreferences,
  savePreferences,
} from '../core/apiClient';
import {
  getAuthState,
  setAuthState,
  clearAuth,
  getCachedPreferences,
  DEFAULT_API,
} from '../core/storageManager';
import {
  resolveApiBase,
  resolveWebBase,
  injectedWebOrigins,
  googleLoginUrl,
} from '../core/allowedApiBases';
import { logger } from '../core/logger';
import { handleError } from '../core/errorHandler';
import { runScan } from '../core/scanManager';
import {
  getApplyQueueDepth,
  processApplyQueue,
} from '../core/applyQueue';
import {
  clearCopilotAlert,
  clearCopilotLogs,
  getCopilotState,
  raiseCopilotAlert,
  setCopilotState,
  broadcastCopilotToNaukriTabs,
} from '../core/copilotState';
import { getApplyQuotaSnapshot } from '../core/planApplyQuota';
import {
  isBlocked,
  isStealthCooldownActive,
} from '../core/safetyStorage';
import {
  pauseBot,
  resumeBot,
  runBot,
  stopBot,
  closeSessionComplete,
} from '../core/botRunner';
import {
  clearAllowedExtraTab,
  ensureNaukriWorkTab,
  getActiveWorkTabId,
  installTabSpamGuard,
  setActiveWorkTabId,
} from '../core/singleTab';
import {
  detectBrowserFamily,
  ensureChromeNamespace,
} from '../shared/browser';

/** Ensure `chrome.*` exists before any listener registration (Firefox may only expose `browser`). */
ensureChromeNamespace();

/**
 * Naukri login happens in the same work tab (no second tab).
 * We re-check login when the tab leaves the login URL or the user presses Confirm.
 */
let pendingNaukriLogin: {
  workTabId: number;
} | null = null;

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reverifyAfterLoginTabClosed(naukriTabId: number): Promise<void> {
  // Let Naukri session cookies settle, then re-check the apply tab.
  await waitMs(1500);
  let login: {
    loggedIn?: boolean;
    status?: 'loggedIn' | 'loggedOut' | 'uncertain';
  } = {};
  try {
    login = await chrome.tabs.sendMessage(naukriTabId, { type: 'CHECK_LOGIN' });
  } catch {
    try {
      await chrome.tabs.reload(naukriTabId);
      await waitMs(2500);
      login = await chrome.tabs.sendMessage(naukriTabId, { type: 'CHECK_LOGIN' });
    } catch {
      login = {};
    }
  }

  if (login.loggedIn) {
    await setCopilotState({
      needsLogin: false,
      loginPauseReason: null,
      paused: false,
    });
    await clearCopilotAlert();
    try {
      await chrome.tabs.sendMessage(naukriTabId, {
        type: 'LOGIN_REVERIFIED',
        loggedIn: true,
      });
    } catch {
      /* content may be reloading */
    }
    return;
  }

  const reason: 'loggedOut' | 'uncertain' =
    login.status === 'loggedOut' ? 'loggedOut' : 'uncertain';
  await setCopilotState({
    paused: true,
    needsLogin: true,
    loginPauseReason: reason,
  });
  try {
    await chrome.tabs.sendMessage(naukriTabId, {
      type: 'SHOW_LOGIN_PROMPT',
      reason,
    });
  } catch {
    /* ignore */
  }
}

function isNaukriLoginUrl(url: string | undefined): boolean {
  return Boolean(url && /naukri\.com\/nlogin|naukri\.com\/.*login/i.test(url));
}

chrome.tabs.onRemoved.addListener((tabId) => {
  clearAllowedExtraTab(tabId);
  if (pendingNaukriLogin?.workTabId === tabId) {
    pendingNaukriLogin = null;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!pendingNaukriLogin || pendingNaukriLogin.workTabId !== tabId) return;
  const url = changeInfo.url ?? tab.url;
  if (!url || isNaukriLoginUrl(url)) return;
  // Left login page in the same tab — re-verify session.
  pendingNaukriLogin = null;
  void reverifyAfterLoginTabClosed(tabId);
});

installTabSpamGuard();

async function persistAndSync(
  type: EventType,
  payload: Record<string, unknown>
): Promise<void> {
  const event: EventEnvelope = {
    eventId: uuidv4(),
    timestamp: new Date().toISOString(),
    type,
    payload,
    retryCount: 0,
    syncStatus: 'pending',
  };
  await enqueue(event);
  await flushQueue();
}

async function sendExtensionConnected(): Promise<void> {
  const auth = await getAuthState();
  if (!auth.accessToken) return;

  await persistAndSync('ExtensionConnected', {
    version: chrome.runtime.getManifest().version,
    connectedAt: new Date().toISOString(),
  });
}

/** Dashboard origins that host webBridge.js (auth sync). */
const DASHBOARD_TAB_URLS = [
  ...new Set([
    'http://localhost:5173/*',
    'http://127.0.0.1:5173/*',
    ...injectedWebOrigins().map((origin) => `${origin}/*`),
  ]),
];

/**
 * After install/update, content scripts are not injected into already-open tabs.
 * Reload Cosmo tabs so webBridge can push the existing dashboard session.
 */
async function reloadOpenDashboardTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: DASHBOARD_TAB_URLS });
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id == null) return;
        try {
          await chrome.tabs.reload(tab.id);
        } catch (error) {
          logger.warn('Failed to reload dashboard tab for auth sync', {
            tabId: tab.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );
  } catch (error) {
    logger.warn('Could not query dashboard tabs for auth sync', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Chrome opens this URL after uninstall so we can ask why they left. */
async function syncUninstallUrl() {
  try {
    const { apiBaseUrl } = await getAuthState();
    const web = resolveWebBase(apiBaseUrl).replace(/\/$/, '');
    const version = chrome.runtime.getManifest().version;
    const params = new URLSearchParams({
      v: version,
      src: 'chrome',
    });
    const url = `${web}/uninstall?${params.toString()}`;
    await chrome.runtime.setUninstallURL(url);
  } catch (error) {
    logger.warn('Could not set uninstall URL', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed');
  chrome.alarms.create('sync-flush', { periodInMinutes: 1 });
  chrome.alarms.create('health-ping', { periodInMinutes: 5 });
  void syncUninstallUrl();
  void reloadOpenDashboardTabs().then(() => sendExtensionConnected());
});

chrome.runtime.onStartup.addListener(() => {
  void syncUninstallUrl();
  void sendExtensionConnected();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-flush' || alarm.name.startsWith('retry-')) {
    await flushQueue();
    await flushScanSessions();
  }
  if (alarm.name === 'health-ping') {
    await reportHealth();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'JOB_DETECTED': {
          const job = message.payload as JobPayload;
          await persistAndSync(
            'JobDetected',
            job as unknown as Record<string, unknown>
          );
          sendResponse({ ok: true });
          break;
        }
        case 'APPLICATION_RECORDED': {
          const job = message.payload as JobPayload;
          await persistAndSync(
            'ApplicationRecorded',
            job as unknown as Record<string, unknown>
          );
          sendResponse({ ok: true });
          break;
        }
        case 'LOGIN': {
          const result = await apiLogin(message.email, message.password);
          if (result.success) {
            await sendExtensionConnected();
            await fetchPreferences();
          }
          sendResponse(result);
          break;
        }
        case 'OPEN_GOOGLE_LOGIN': {
          try {
            const auth = await getAuthState();
            const url = googleLoginUrl(auth.apiBaseUrl);
            const existing = await chrome.tabs.query({
              url: DASHBOARD_TAB_URLS,
            });
            const preferred =
              existing.find((tab) =>
                Boolean(tab.url && /\/login(?:\?|$)/.test(tab.url))
              ) ?? existing[0];
            if (preferred?.id != null) {
              await chrome.tabs.update(preferred.id, { url, active: true });
              if (preferred.windowId != null) {
                await chrome.windows.update(preferred.windowId, {
                  focused: true,
                });
              }
            } else {
              await chrome.tabs.create({ url, active: true });
            }
            sendResponse({ ok: true });
          } catch (error) {
            sendResponse({
              ok: false,
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not open Cosmo login',
            });
          }
          break;
        }
        case 'LOGOUT': {
          const auth = await getAuthState();
          if (auth.refreshToken || auth.accessToken) {
            try {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
              };
              if (auth.accessToken) {
                headers.Authorization = `Bearer ${auth.accessToken}`;
              }
              await fetch(`${auth.apiBaseUrl}/api/v1/auth/logout`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  refreshToken: auth.refreshToken ?? undefined,
                }),
              });
            } catch {
              /* still clear locally */
            }
          }
          await clearAuth();
          sendResponse({ ok: true });
          break;
        }
        case 'SYNC_AUTH_FROM_WEB': {
          if (message.cleared) {
            await clearAuth();
            sendResponse({ ok: true });
            break;
          }

          const accessToken =
            typeof message.accessToken === 'string' ? message.accessToken : null;
          const refreshToken =
            typeof message.refreshToken === 'string'
              ? message.refreshToken
              : null;
          const apiBaseUrl = resolveApiBase(
            typeof message.apiBaseUrl === 'string' ? message.apiBaseUrl : '',
            DEFAULT_API
          );

          if (!accessToken || !refreshToken) {
            sendResponse({ ok: false, error: 'Missing tokens' });
            break;
          }

          const current = await getAuthState();
          const unchanged =
            current.accessToken === accessToken &&
            current.refreshToken === refreshToken &&
            current.apiBaseUrl === apiBaseUrl;

          if (!unchanged) {
            await setAuthState({ accessToken, refreshToken, apiBaseUrl });
            await sendExtensionConnected();
            await fetchPreferences();
          }

          sendResponse({ ok: true, synced: !unchanged });
          break;
        }
        case 'GET_STATUS': {
          const auth = await getAuthState();
          const health = await reportHealth();
          // Always prefer DB preferences so extension stays in sync with dashboard.
          const remotePrefs = auth.accessToken
            ? await fetchPreferences()
            : null;
          const prefs = remotePrefs?.success
            ? remotePrefs.data
            : await getCachedPreferences();
          const applyQueueDepth = await getApplyQueueDepth();
          const copilot = await getCopilotState();
          sendResponse({
            auth,
            health: { ...health, applyQueueDepth },
            preferences: prefs,
            copilot,
          });
          break;
        }
        case 'GET_PREFERENCES': {
          const remote = await fetchPreferences();
          if (remote.success) {
            sendResponse({ success: true, data: remote.data });
          } else {
            sendResponse({
              success: true,
              data: await getCachedPreferences(),
            });
          }
          break;
        }
        case 'SAVE_PREFERENCES': {
          const prefs = message.preferences as JobPreferences;
          const result = await savePreferences(prefs);
          sendResponse(result);
          break;
        }
        case 'FLUSH_QUEUE': {
          await flushQueue();
          await flushScanSessions();
          sendResponse({ ok: true });
          break;
        }
        case 'START_SCAN': {
          const result = await runScan({
            persistAndSync: async (type, payload) => {
              await persistAndSync(type, payload);
            },
          });
          if (result.queuedForApply > 0) {
            await raiseCopilotAlert(
              `${result.queuedForApply} job(s) ready — open co-pilot and press Start to apply with consent.`,
              'info',
              'generic'
            );
          }
          sendResponse(result);
          break;
        }
        case 'GET_APPLY_QUOTA': {
          try {
            const quota = await getApplyQuotaSnapshot(Boolean(message.force));
            sendResponse({ ok: true, quota });
          } catch (error) {
            sendResponse({
              ok: false,
              message:
                error instanceof Error ? error.message : 'Could not load quota',
            });
          }
          break;
        }
        case 'GET_SAFETY_STATUS': {
          const state = await getCopilotState();
          sendResponse({
            ok: true,
            blocked: await isBlocked(),
            stealthCooldown: await isStealthCooldownActive(),
            runInBackground: state.runInBackground,
          });
          break;
        }
        case 'START_APPLY_QUEUE': {
          const result = await processApplyQueue({
            persistJobDetected: async (payload) => {
              await persistAndSync(
                'JobDetected',
                payload as unknown as Record<string, unknown>
              );
            },
            persistApplicationRecorded: async (payload) => {
              await persistAndSync(
                'ApplicationRecorded',
                payload as unknown as Record<string, unknown>
              );
            },
          });
          sendResponse({ ok: true, ...result });
          break;
        }
        case 'COPILOT_START': {
          const auth = await getAuthState();
          if (!auth.accessToken) {
            sendResponse({
              ok: false,
              message: 'Sign in to Cosmo from the extension popup first.',
            });
            break;
          }
          if (
            !message.consentAccepted ||
            message.consentVersion !== CONSENT_VERSION
          ) {
            sendResponse({
              ok: false,
              message: 'Consent required before starting co-pilot.',
            });
            break;
          }
          if (await isBlocked()) {
            sendResponse({
              ok: false,
              message:
                'Naukri verification cooldown active — wait before starting again.',
            });
            break;
          }
          await clearCopilotLogs();
          await clearCopilotAlert();
          void runBot({
            persistJobDetected: async (payload) => {
              await persistAndSync(
                'JobDetected',
                payload as unknown as Record<string, unknown>
              );
            },
            persistApplicationRecorded: async (payload) => {
              await persistAndSync(
                'ApplicationRecorded',
                payload as unknown as Record<string, unknown>
              );
            },
          }).then(async () => {
            /* session finished */
          });
          // Open Cosmo dock on Naukri (consent / progress) even if it was minimized.
          void broadcastCopilotToNaukriTabs({ type: 'COPILOT_EXPAND' });
          // Retry expand after the Naukri tab/content script loads.
          setTimeout(() => {
            void broadcastCopilotToNaukriTabs({ type: 'COPILOT_EXPAND' });
          }, 2500);
          setTimeout(() => {
            void broadcastCopilotToNaukriTabs({ type: 'COPILOT_EXPAND' });
          }, 5000);
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_DISMISS_ALERT': {
          await clearCopilotAlert();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_PAUSE': {
          await pauseBot();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_RESUME': {
          await resumeBot();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_CONFIRM_LOGIN': {
          await setCopilotState({
            loginUserConfirmed: true,
            needsLogin: false,
            loginPauseReason: null,
            paused: false,
          });
          await resumeBot();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_STOP': {
          await stopBot();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_SESSION_CLOSE': {
          await closeSessionComplete();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_SET_BACKGROUND': {
          if (Boolean(message.runInBackground)) {
            if (await isStealthCooldownActive()) {
              sendResponse({
                ok: false,
                message:
                  'Stealth cooldown active — use foreground mode for safer pacing.',
              });
              break;
            }
          }
          await setCopilotState({
            runInBackground: Boolean(message.runInBackground),
            stealthStartedAt: Boolean(message.runInBackground)
              ? new Date().toISOString()
              : null,
            stealthAppliesThisSession: 0,
          });
          sendResponse({ ok: true });
          break;
        }
        case 'OPEN_NAUKRI_LOGIN': {
          const loginUrl =
            typeof message.loginUrl === 'string' && message.loginUrl
              ? message.loginUrl
              : 'https://www.naukri.com/nlogin/login';
          const preferredId =
            typeof message.naukriTabId === 'number'
              ? message.naukriTabId
              : sender.tab?.id ?? getActiveWorkTabId();

          let workTabId: number | null = preferredId ?? null;
          if (workTabId != null) {
            try {
              await chrome.tabs.update(workTabId, {
                url: loginUrl,
                active: true,
              });
              setActiveWorkTabId(workTabId);
            } catch {
              workTabId = null;
            }
          }
          if (workTabId == null) {
            // No existing tab — open one work tab only (never a second login tab).
            const tab = await ensureNaukriWorkTab({
              url: loginUrl,
              active: true,
            });
            workTabId = tab.id ?? null;
          }

          if (workTabId != null) {
            pendingNaukriLogin = { workTabId };
            setActiveWorkTabId(workTabId);
          }
          sendResponse({ ok: true, loginTabId: workTabId });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: handleError(error, 'onMessage') });
    }
  })();
  return true;
});

logger.info('Background script ready', {
  browser: detectBrowserFamily(),
  background:
    detectBrowserFamily() === 'firefox' ? 'event_page' : 'service_worker',
});
