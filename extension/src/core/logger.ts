export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    console.debug('[Atlas]', message, meta ?? ''),
  info: (message: string, meta?: Record<string, unknown>) =>
    console.info('[Atlas]', message, meta ?? ''),
  warn: (message: string, meta?: Record<string, unknown>) =>
    console.warn('[Atlas]', message, meta ?? ''),
  error: (message: string, meta?: Record<string, unknown>) =>
    console.error('[Atlas]', message, meta ?? ''),
};
