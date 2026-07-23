export type PaceMode = 'assisted' | 'stealth';
export type PacePhase = 'nav' | 'scroll' | 'dwell' | 'betweenJobs' | 'read';

export const CONSENT_VERSION = 1;

export const SESSION_BREAK_AFTER_APPLIES = 15;
export const SESSION_BREAK_MS = 2 * 60 * 1000;

export const STEALTH_MAX_APPLIES = 10;
export const STEALTH_MAX_MS = 20 * 60 * 1000;
export const STEALTH_COOLDOWN_MS = 30 * 60 * 1000;

export const BLOCK_COOLDOWN_MS = 60 * 60 * 1000;

const PACE_RANGES: Record<
  PaceMode,
  Record<PacePhase, { min: number; max: number }>
> = {
  assisted: {
    nav: { min: 3000, max: 6000 },
    scroll: { min: 2000, max: 5000 },
    dwell: { min: 4000, max: 10000 },
    betweenJobs: { min: 8000, max: 18000 },
    read: { min: 25000, max: 45000 },
  },
  stealth: {
    nav: { min: 4000, max: 8000 },
    scroll: { min: 3000, max: 6000 },
    dwell: { min: 6000, max: 12000 },
    betweenJobs: { min: 12000, max: 25000 },
    read: { min: 30000, max: 50000 },
  },
};

function jitter(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function paceDelayMs(mode: PaceMode, phase: PacePhase): number {
  const range = PACE_RANGES[mode][phase];
  return jitter(range.min, range.max);
}

export function shouldTakeReadPause(appliesThisSession: number): boolean {
  if (appliesThisSession <= 0) return false;
  if (appliesThisSession % 5 === 0) return Math.random() < 0.6;
  if (appliesThisSession % 4 === 0) return Math.random() < 0.35;
  return false;
}

export function shouldTakeSessionBreak(appliesThisSession: number): boolean {
  return (
    appliesThisSession > 0 &&
    appliesThisSession % SESSION_BREAK_AFTER_APPLIES === 0
  );
}

export function formatBreakCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
