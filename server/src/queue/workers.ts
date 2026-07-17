import { Queue, Worker, Job } from 'bullmq';
import { getRedis, isRedisAvailable } from '../config/redis';
import { logger } from '../config/logger';

export type EnrichmentJob = {
  userId: string;
  eventId: string;
  type: string;
};

const QUEUE_NAME = 'event-enrichment';

let queue: Queue<EnrichmentJob> | null = null;
let worker: Worker<EnrichmentJob> | null = null;

export function initQueue(): void {
  const connection = getRedis();
  if (!connection || !isRedisAvailable()) {
    logger.warn('BullMQ not started — Redis unavailable');
    return;
  }

  queue = new Queue<EnrichmentJob>(QUEUE_NAME, {
    connection: connection.duplicate(),
  });

  worker = new Worker<EnrichmentJob>(
    QUEUE_NAME,
    async (job: Job<EnrichmentJob>) => {
      logger.info('Enrichment job processed', {
        jobId: job.id,
        eventId: job.data.eventId,
        type: job.data.type,
      });
    },
    { connection: connection.duplicate() }
  );

  worker.on('failed', (job, err) => {
    logger.error('Enrichment job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info('BullMQ worker started', { queue: QUEUE_NAME });
}

export async function enqueueEventEnrichment(
  data: EnrichmentJob
): Promise<void> {
  if (!queue) {
    logger.debug('Skipping enrichment enqueue — queue unavailable', data);
    return;
  }
  await queue.add('enrich', data, {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function closeQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
}
