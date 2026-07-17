import { logger } from './logger';

export function handleError(error: unknown, context: string): string {
  const message =
    error instanceof Error ? error.message : 'Unexpected extension error';
  logger.error(context, {
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return message;
}
