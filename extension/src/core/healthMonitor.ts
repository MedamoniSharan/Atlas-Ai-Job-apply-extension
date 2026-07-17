import { healthCheck } from './apiClient';
import { getQueue } from './queueManager';
import { getAuthState } from './storageManager';
import { logger } from './logger';

export type HealthStatus = {
  apiReachable: boolean;
  authenticated: boolean;
  queueDepth: number;
  checkedAt: string;
};

export async function reportHealth(): Promise<HealthStatus> {
  const auth = await getAuthState();
  const queue = await getQueue();
  const apiReachable = await healthCheck();
  const status: HealthStatus = {
    apiReachable,
    authenticated: Boolean(auth.accessToken),
    queueDepth: queue.length,
    checkedAt: new Date().toISOString(),
  };
  logger.debug('Health status', status);
  return status;
}
