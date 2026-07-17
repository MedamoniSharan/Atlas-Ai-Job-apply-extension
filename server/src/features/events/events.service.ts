import {
  Application,
  EventEnvelope,
  jobPayloadSchema,
  SyncEventsRequest,
} from '@atlas/shared';
import { ActivityModel } from './activity.model';
import { ApplicationModel, IApplication } from '../applications/application.model';
import { getIo } from '../../realtime/socket';
import { logger } from '../../config/logger';

function toApplication(doc: IApplication): Application {
  return {
    id: doc._id.toString(),
    eventId: doc.eventId,
    userId: doc.userId.toString(),
    platform: doc.platform,
    externalJobId: doc.externalJobId,
    title: doc.title,
    company: doc.company,
    location: doc.location,
    url: doc.url,
    status: doc.status,
    appliedAt: doc.appliedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function upsertApplicationFromEvent(
  userId: string,
  event: EventEnvelope
): Promise<Application | null> {
  if (
    event.type !== 'ApplicationRecorded' &&
    event.type !== 'JobDetected'
  ) {
    return null;
  }

  const parsed = jobPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    logger.warn('Invalid job payload for event', {
      eventId: event.eventId,
      issues: parsed.error.issues,
    });
    return null;
  }

  const job = parsed.data;
  const status =
    event.type === 'ApplicationRecorded'
      ? job.status === 'detected'
        ? 'applied'
        : job.status
      : job.status;

  const doc = await ApplicationModel.findOneAndUpdate(
    { userId, eventId: event.eventId },
    {
      $set: {
        platform: job.platform,
        externalJobId: job.externalJobId,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        status,
        appliedAt: job.appliedAt ? new Date(job.appliedAt) : undefined,
        metadata: job.metadata,
      },
      $setOnInsert: {
        eventId: event.eventId,
        userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return toApplication(doc);
}

export async function syncEvents(
  userId: string,
  body: SyncEventsRequest
): Promise<{ processed: number; applications: Application[] }> {
  const applications: Application[] = [];

  for (const event of body.events) {
    await ActivityModel.findOneAndUpdate(
      { userId, eventId: event.eventId },
      {
        $set: {
          type: event.type,
          payload: event.payload,
          syncStatus: 'synced',
        },
        $setOnInsert: {
          eventId: event.eventId,
          userId,
        },
      },
      { upsert: true, new: true }
    );

    const app = await upsertApplicationFromEvent(userId, event);
    if (app) {
      applications.push(app);
      const io = getIo();
      io?.to(`user:${userId}`).emit('application.updated', app);
    }
  }

  return { processed: body.events.length, applications };
}
