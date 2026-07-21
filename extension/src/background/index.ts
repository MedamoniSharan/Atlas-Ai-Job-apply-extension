import { v4 as uuidv4 } from 'uuid';
import type { EventEnvelope, EventType, JobPayload, JobPreferences } from '@atlas/shared';
import { enqueue } from '../core/queueManager';
import { flushQueue } from '../core/syncManager';
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
  setCopilotState,
} from '../core/copilotState';
import {
  pauseBot,
  resumeBot,
  runBot,
  stopBot,
} from '../core/botRunner';

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

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed');
  chrome.alarms.create('sync-flush', { periodInMinutes: 1 });
  chrome.alarms.create('health-ping', { periodInMinutes: 5 });
  void sendExtensionConnected();
});

chrome.runtime.onStartup.addListener(() => {
  void sendExtensionConnected();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-flush' || alarm.name.startsWith('retry-')) {
    await flushQueue();
  }
  if (alarm.name === 'health-ping') {
    await reportHealth();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
        case 'LOGOUT': {
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
          const apiBaseUrl =
            typeof message.apiBaseUrl === 'string' && message.apiBaseUrl
              ? message.apiBaseUrl
              : DEFAULT_API;

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
        case 'SET_API_BASE': {
          await setAuthState({
            apiBaseUrl: message.apiBaseUrl || DEFAULT_API,
          });
          sendResponse({ ok: true });
          break;
        }
        case 'FLUSH_QUEUE': {
          await flushQueue();
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
            void processApplyQueue(
              {
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
              },
              result.tabId
            );
          }
          sendResponse(result);
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
              message: 'Sign in to Atlas from the extension popup first.',
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
          });
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
        case 'COPILOT_STOP': {
          await stopBot();
          sendResponse({ ok: true });
          break;
        }
        case 'COPILOT_SET_BACKGROUND': {
          await setCopilotState({
            runInBackground: Boolean(message.runInBackground),
          });
          sendResponse({ ok: true });
          break;
        }
        case 'OPEN_NAUKRI_LOGIN': {
          const loginUrl =
            typeof message.loginUrl === 'string' && message.loginUrl
              ? message.loginUrl
              : 'https://www.naukri.com/nlogin/login';
          await chrome.tabs.create({ url: loginUrl, active: true });
          sendResponse({ ok: true });
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

logger.info('Background service worker ready');
