export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    console.debug('[CodeXCareer]', message, meta ?? ''),
  info: (message: string, meta?: Record<string, unknown>) =>
    console.info('[CodeXCareer]', message, meta ?? ''),
  warn: (message: string, meta?: Record<string, unknown>) =>
    console.warn('[CodeXCareer]', message, meta ?? ''),
  error: (message: string, meta?: Record<string, unknown>) =>
    console.error('[CodeXCareer]', message, meta ?? ''),
};
