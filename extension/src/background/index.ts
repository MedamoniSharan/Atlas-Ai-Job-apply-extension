import { v4 as uuidv4 } from 'uuid';
import type { EventEnvelope, EventType, JobPayload } from '@atlas/shared';
import { enqueue } from '../core/queueManager';
import { flushQueue } from '../core/syncManager';
import { reportHealth } from '../core/healthMonitor';
import { login as apiLogin } from '../core/apiClient';
import {
  getAuthState,
  setAuthState,
  clearAuth,
  DEFAULT_API,
} from '../core/storageManager';
import { logger } from '../core/logger';
import { handleError } from '../core/errorHandler';

chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed');
  chrome.alarms.create('sync-flush', { periodInMinutes: 1 });
  chrome.alarms.create('health-ping', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync-flush' || alarm.name.startsWith('retry-')) {
    await flushQueue();
  }
  if (alarm.name === 'health-ping') {
    await reportHealth();
  }
});

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'JOB_DETECTED': {
          const job = message.payload as JobPayload;
          await persistAndSync('JobDetected', job as unknown as Record<string, unknown>);
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
          sendResponse(result);
          break;
        }
        case 'LOGOUT': {
          await clearAuth();
          sendResponse({ ok: true });
          break;
        }
        case 'GET_STATUS': {
          const auth = await getAuthState();
          const health = await reportHealth();
          sendResponse({ auth, health });
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
