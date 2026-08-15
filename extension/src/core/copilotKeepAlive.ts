/** Keep the MV3 service worker alive for long co-pilot sessions. */

export const COPILOT_KEEPALIVE_ALARM = 'copilot-keepalive';

/** Chrome allows periodInMinutes down to 0.5 (30s) for most builds. */
const PERIOD_MINUTES = 0.5;

export async function startCopilotKeepAlive(): Promise<void> {
  try {
    await chrome.alarms.create(COPILOT_KEEPALIVE_ALARM, {
      periodInMinutes: PERIOD_MINUTES,
    });
  } catch {
    /* alarms may be unavailable in unit tests */
  }
}

export async function stopCopilotKeepAlive(): Promise<void> {
  try {
    await chrome.alarms.clear(COPILOT_KEEPALIVE_ALARM);
  } catch {
    /* ignore */
  }
}

export function isCopilotKeepAliveAlarm(name: string): boolean {
  return name === COPILOT_KEEPALIVE_ALARM;
}
