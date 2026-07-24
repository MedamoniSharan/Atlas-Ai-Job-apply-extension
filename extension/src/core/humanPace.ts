import {
  BLOCK_COOLDOWN_MS,
  SESSION_BREAK_MS,
  STEALTH_COOLDOWN_MS,
  STEALTH_MAX_APPLIES,
  STEALTH_MAX_MS,
  formatBreakCountdown,
  paceDelayMs,
  shouldTakeReadPause,
  shouldTakeSessionBreak,
  type PaceMode,
  type PacePhase,
} from '@cosmo/shared';
import {
  appendCopilotLog,
  getCopilotState,
  raiseCopilotAlert,
  setCopilotState,
} from './copilotState';
import { setBlockedCooldown, setStealthCooldown } from './safetyStorage';

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function paceModeFromStealth(stealth: boolean): PaceMode {
  return stealth ? 'stealth' : 'assisted';
}

const PHASE_LABELS: Record<PacePhase, string> = {
  nav: 'Loading page',
  scroll: 'Scrolling list',
  dwell: 'Reading job details',
  betweenJobs: 'Slowing down before next job',
  read: 'Extra pause — human pacing',
};

async function clearPaceUi(): Promise<void> {
  await setCopilotState({ paceLabel: null, paceRemainingMs: null });
}

/**
 * Human-paced wait with live countdown in the co-pilot panel + activity log.
 */
export async function pacedWait(
  mode: PaceMode,
  phase: PacePhase,
  options?: { jobTitle?: string; silent?: boolean }
): Promise<boolean> {
  const ms = paceDelayMs(mode, phase);
  const label = PHASE_LABELS[phase];
  const secs = Math.max(1, Math.round(ms / 1000));
  const jobBit = options?.jobTitle ? ` — ${options.jobTitle}` : '';

  if (!options?.silent) {
    await setCopilotState({
      paceLabel: label,
      paceRemainingMs: ms,
    });
    await appendCopilotLog(
      `${label} (~${secs}s)${jobBit}`,
      'info'
    );
  }

  const end = Date.now() + ms;
  while (Date.now() < end) {
    const state = await getCopilotState();
    if (!state.running) {
      await clearPaceUi();
      return false;
    }
    // Stay paused for login/questions, but keep pace UI until wait finishes after resume.
    if (state.paused && !state.sessionBreakUntil) {
      await wait(400);
      continue;
    }
    const remaining = Math.max(0, end - Date.now());
    await setCopilotState({
      paceLabel: label,
      paceRemainingMs: remaining,
    });
    await wait(Math.min(1000, remaining || 1000));
  }

  await clearPaceUi();
  return true;
}

export async function runReadPauseIfNeeded(
  mode: PaceMode,
  appliesThisSession: number,
  jobTitle?: string
): Promise<boolean> {
  if (!shouldTakeReadPause(appliesThisSession)) return true;
  return pacedWait(mode, 'read', { jobTitle });
}

export async function runSessionBreakIfNeeded(
  appliesThisSession: number
): Promise<boolean> {
  if (!shouldTakeSessionBreak(appliesThisSession)) return true;

  await clearPaceUi();
  const until = Date.now() + SESSION_BREAK_MS;
  await setCopilotState({
    paused: true,
    sessionBreakUntil: new Date(until).toISOString(),
    sessionBreakRemainingMs: SESSION_BREAK_MS,
  });
  await appendCopilotLog('Taking a 2-minute break — safer pacing.', 'warn');

  while (Date.now() < until) {
    const state = await getCopilotState();
    if (!state.running) {
      await setCopilotState({
        sessionBreakUntil: null,
        sessionBreakRemainingMs: null,
      });
      return false;
    }
    await setCopilotState({ sessionBreakRemainingMs: until - Date.now() });
    await wait(1000);
  }

  await setCopilotState({
    paused: false,
    sessionBreakUntil: null,
    sessionBreakRemainingMs: null,
  });
  await appendCopilotLog('Break complete — continuing co-pilot session.', 'success');
  return true;
}

export async function handleBlockedPage(reason: string): Promise<void> {
  const until = new Date(Date.now() + BLOCK_COOLDOWN_MS);
  await setBlockedCooldown(until);
  await clearPaceUi();
  await raiseCopilotAlert(
    `Naukri asked for verification — co-pilot stopped. Solve it in your browser, wait, then Start a new session. (${reason})`,
    'error',
    'blocked'
  );
  await setCopilotState({
    running: false,
    paused: false,
    currentTitle: '',
    sessionBreakUntil: null,
    sessionBreakRemainingMs: null,
  });
  await appendCopilotLog(
    'Stopped — Naukri verification/block page detected. No retries.',
    'error'
  );
}

export async function enforceStealthSessionCap(): Promise<boolean> {
  const state = await getCopilotState();
  if (!state.runInBackground) return true;

  const startedAt = state.stealthStartedAt
    ? Date.parse(state.stealthStartedAt)
    : Date.now();
  const elapsed = Date.now() - startedAt;
  const overApplies = state.stealthAppliesThisSession >= STEALTH_MAX_APPLIES;
  const overTime = elapsed >= STEALTH_MAX_MS;

  if (!overApplies && !overTime) return true;

  await setStealthCooldown(new Date(Date.now() + STEALTH_COOLDOWN_MS));
  await clearPaceUi();
  await setCopilotState({
    runInBackground: false,
    paused: true,
  });
  await appendCopilotLog(
    'Stealth session cap reached — switched to foreground. Press Resume to continue.',
    'warn'
  );
  return false;
}

export async function noteStealthApply(): Promise<void> {
  const state = await getCopilotState();
  if (!state.runInBackground) return;
  const stealthAppliesThisSession = state.stealthAppliesThisSession + 1;
  await setCopilotState({
    stealthAppliesThisSession,
    stealthStartedAt: state.stealthStartedAt ?? new Date().toISOString(),
  });
  await enforceStealthSessionCap();
}

export { formatBreakCountdown };
