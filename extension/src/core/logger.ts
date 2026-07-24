export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    console.debug('[Cosmo]', message, meta ?? ''),
  info: (message: string, meta?: Record<string, unknown>) =>
    console.info('[Cosmo]', message, meta ?? ''),
  warn: (message: string, meta?: Record<string, unknown>) =>
    console.warn('[Cosmo]', message, meta ?? ''),
  error: (message: string, meta?: Record<string, unknown>) =>
    console.error('[Cosmo]', message, meta ?? ''),
};
