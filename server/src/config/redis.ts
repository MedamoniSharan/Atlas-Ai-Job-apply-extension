import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let redis: Redis | null = null;
let redisAvailable = false;

export function getRedis(): Redis | null {
  return redisAvailable ? redis : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function connectRedis(): Promise<Redis | null> {
  const client = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 2000,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  client.on('error', (error) => {
    if (redisAvailable) {
      logger.warn('Redis error', { error: error.message });
      redisAvailable = false;
    }
  });

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Unexpected Redis ping response');
    }
    redis = client;
    redisAvailable = true;
    logger.info('Redis connected', { url: env.redisUrl });
    return redis;
  } catch (error) {
    redisAvailable = false;
    redis = null;
    client.disconnect(false);
    logger.warn('Redis unavailable — queue/cache disabled', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
