import {
  APPLY_CAP_CODES,
  getEffectivePlan,
  getPlanAppliesLimit,
  getPlanAppliesPerDay,
  jobPayloadSchema,
  type EventEnvelope,
  type SyncEventsResult,
} from '@cosmo/shared';
import { ActivityModel } from './activity.model';
import { ApplicationModel, IApplication } from '../applications/application.model';
import { UserModel } from '../users/user.model';
import { getIo } from '../../realtime/socket';
import { logger } from '../../config/logger';
import { AppError } from '../../middleware/errorHandler';
import {
  appliedCountFilter,
  dayRange,
  monthRange,
} from '../applications/applyCount';

function toApplication(doc: IApplication) {
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
    companyLogo: doc.companyLogo,
    description: doc.description,
    experience: doc.experience,
    salary: doc.salary,
    skills: doc.skills,
    rating: doc.rating,
    reviews: doc.reviews,
    postedAt: doc.postedAt,
    openings: doc.openings,
    applicants: doc.applicants,
    highlights: doc.highlights,
    role: doc.role,
    industry: doc.industry,
    department: doc.department,
    employmentType: doc.employmentType,
    roleCategory: doc.roleCategory,
    education: doc.education,
    aboutCompany: doc.aboutCompany,
    status: doc.status,
    appliedAt: doc.appliedAt?.toISOString(),
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function countsAsApply(event: EventEnvelope, status: string): boolean {
  if (event.type !== 'ApplicationRecorded') return false;
  const parsed = jobPayloadSchema.safeParse(event.payload);
  if (!parsed.success) return false;
  if (parsed.data.metadata?.skipped) return false;
  return status === 'applied' || parsed.data.metadata?.source === 'auto_apply';
}

async function assertApplyCaps(userId: string): Promise<void> {
  const user = await UserModel.findById(userId).lean();
  if (!user) return;

  const day = dayRange();
  const month = monthRange();

  const [dayUsed, monthUsed] = await Promise.all([
    ApplicationModel.countDocuments(appliedCountFilter(userId, day)),
    ApplicationModel.countDocuments(appliedCountFilter(userId, month)),
  ]);

  const plan = getEffectivePlan(user.plan, user.planExpiresAt);
  const dayLimit = getPlanAppliesPerDay(user.plan, user.planExpiresAt);
  const monthLimit = getPlanAppliesLimit(user.plan, user.planExpiresAt);

  if (dayUsed >= dayLimit) {
    throw new AppError(
      `Daily safety limit reached (${dayLimit}/day on ${plan})`,
      429,
      'APPLY_DAY_CAP'
    );
  }
  if (monthUsed >= monthLimit) {
    throw new AppError(
      `Monthly apply limit reached (${monthLimit}/month on ${plan})`,
      429,
      'APPLY_PLAN_CAP'
    );
  }
}

type UpsertOutcome =
  | { kind: 'ignored' }
  | { kind: 'invalid' }
  | { kind: 'upserted'; application: ReturnType<typeof toApplication> };

export function isAppliedRecord(
  status?: string | null,
  metadata?: Record<string, unknown>
): boolean {
  return status === 'applied' || metadata?.source === 'auto_apply';
}

/**
 * A later scan re-detects jobs we already applied to; never demote them back
 * out of the Applied bucket.
 */
export function resolveApplicationStatus(
  eventType: EventEnvelope['type'],
  jobStatus: string,
  existingIsApplied: boolean
): string {
  const incoming =
    eventType === 'ApplicationRecorded' && jobStatus === 'detected'
      ? 'applied'
      : jobStatus;
  return existingIsApplied && incoming !== 'applied' ? 'applied' : incoming;
}

/** Keeps an applied job labelled auto_apply so the applied bucket still matches it. */
export function mergeApplicationMetadata(
  existingMetadata: Record<string, unknown>,
  incomingMetadata: Record<string, unknown> | undefined,
  existingIsApplied: boolean
): Record<string, unknown> {
  const merged = { ...existingMetadata, ...(incomingMetadata ?? {}) };
  if (existingIsApplied && existingMetadata.source === 'auto_apply') {
    merged.source = 'auto_apply';
    merged.skipped = false;
  }
  return merged;
}

async function upsertApplicationFromEvent(
  userId: string,
  event: EventEnvelope
): Promise<UpsertOutcome> {
  if (
    event.type !== 'ApplicationRecorded' &&
    event.type !== 'JobDetected'
  ) {
    return { kind: 'ignored' };
  }

  const parsed = jobPayloadSchema.safeParse(event.payload);
  if (!parsed.success) {
    logger.warn('Invalid job payload for event', {
      eventId: event.eventId,
      issues: parsed.error.issues,
    });
    return { kind: 'invalid' };
  }

  const job = parsed.data;

  const filter =
    job.externalJobId && job.externalJobId.length > 0
      ? { userId, platform: job.platform, externalJobId: job.externalJobId }
      : { userId, eventId: event.eventId };

  const richFields: Record<string, unknown> = {};
  const existing = await ApplicationModel.findOne(filter).lean();

  const existingMetadata =
    (existing?.metadata as Record<string, unknown> | undefined) ?? {};
  const existingIsApplied = isAppliedRecord(existing?.status, existingMetadata);
  const status = resolveApplicationStatus(
    event.type,
    job.status,
    existingIsApplied
  );

  if (!existingIsApplied && countsAsApply(event, status)) {
    await assertApplyCaps(userId);
  }

  const preferLonger = (next?: string, prev?: string | null) => {
    if (!next) return undefined;
    if (!prev) return next;
    return next.length >= prev.length ? next : undefined;
  };
  const preferList = (next?: string[], prev?: string[] | null) => {
    if (!next?.length) return undefined;
    if (!prev?.length || next.length >= prev.length) return next;
    return undefined;
  };

  const logo = job.companyLogo || existing?.companyLogo;
  if (logo) richFields.companyLogo = logo;

  const description = preferLonger(job.description, existing?.description);
  if (description) richFields.description = description;

  if (job.experience) richFields.experience = job.experience;
  if (job.salary) richFields.salary = job.salary;
  const skills = preferList(job.skills, existing?.skills);
  if (skills) richFields.skills = skills;
  if (job.rating) richFields.rating = job.rating;
  if (job.reviews) richFields.reviews = job.reviews;
  if (job.postedAt) richFields.postedAt = job.postedAt;
  if (job.openings) richFields.openings = job.openings;
  if (job.applicants) richFields.applicants = job.applicants;
  const highlights = preferList(job.highlights, existing?.highlights);
  if (highlights) richFields.highlights = highlights;
  if (job.role) richFields.role = job.role;
  if (job.industry) richFields.industry = job.industry;
  if (job.department) richFields.department = job.department;
  if (job.employmentType) richFields.employmentType = job.employmentType;
  if (job.roleCategory) richFields.roleCategory = job.roleCategory;
  if (job.education) richFields.education = job.education;
  const about = preferLonger(job.aboutCompany, existing?.aboutCompany);
  if (about) richFields.aboutCompany = about;
  if (job.location) richFields.location = job.location;
  if (job.url) richFields.url = job.url;

  const mergedMetadata = mergeApplicationMetadata(
    existingMetadata,
    job.metadata,
    existingIsApplied
  );

  const appliedAt = job.appliedAt
    ? new Date(job.appliedAt)
    : status === 'applied' && !existing?.appliedAt
      ? new Date(event.timestamp)
      : undefined;

  const doc = await ApplicationModel.findOneAndUpdate(
    filter,
    {
      $set: {
        platform: job.platform,
        externalJobId: job.externalJobId,
        title: job.title,
        company: job.company,
        status,
        ...(appliedAt ? { appliedAt } : {}),
        metadata: Object.keys(mergedMetadata).length ? mergedMetadata : undefined,
        ...richFields,
      },
      $setOnInsert: {
        eventId: event.eventId,
        userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { kind: 'upserted', application: toApplication(doc) };
}

async function handleExtensionConnected(
  userId: string,
  event: EventEnvelope
): Promise<void> {
  const connectedAt = new Date(event.timestamp);
  await UserModel.findByIdAndUpdate(userId, {
    $set: { extensionConnectedAt: connectedAt },
  });

  const io = getIo();
  io?.to(`user:${userId}`).emit('extension.connected', {
    extensionConnectedAt: connectedAt.toISOString(),
  });
}

async function recordActivity(
  userId: string,
  event: EventEnvelope,
  syncStatus: 'synced' | 'failed'
): Promise<void> {
  await ActivityModel.findOneAndUpdate(
    { userId, eventId: event.eventId },
    {
      $set: {
        type: event.type,
        payload: event.payload,
        syncStatus,
      },
      $setOnInsert: {
        eventId: event.eventId,
        userId,
      },
    },
    { upsert: true, new: true }
  );
}

export async function syncEvents(
  userId: string,
  body: { events: EventEnvelope[] }
): Promise<
  SyncEventsResult & { applications: ReturnType<typeof toApplication>[] }
> {
  const applications: ReturnType<typeof toApplication>[] = [];
  const syncedEventIds: string[] = [];
  const failedEventIds: string[] = [];
  const invalidEventIds: string[] = [];
  let capError: { code: string; message: string } | null = null;

  for (const event of body.events) {
    // Once a cap is hit, further applies cannot be stored — leave them queued
    // rather than reporting them as accepted.
    if (capError && event.type === 'ApplicationRecorded') {
      failedEventIds.push(event.eventId);
      await recordActivity(userId, event, 'failed');
      continue;
    }

    try {
      if (event.type === 'ExtensionConnected') {
        await handleExtensionConnected(userId, event);
      }

      const outcome = await upsertApplicationFromEvent(userId, event);
      if (outcome.kind === 'upserted') {
        applications.push(outcome.application);
        getIo()?.to(`user:${userId}`).emit('application.updated', outcome.application);
      } else if (outcome.kind === 'invalid') {
        invalidEventIds.push(event.eventId);
      }

      syncedEventIds.push(event.eventId);
      await recordActivity(userId, event, 'synced');
    } catch (error) {
      failedEventIds.push(event.eventId);
      await recordActivity(userId, event, 'failed');

      const code = error instanceof AppError ? error.code : undefined;
      if (code && (APPLY_CAP_CODES as readonly string[]).includes(code)) {
        capError = {
          code,
          message: (error as AppError).message,
        };
        continue;
      }

      logger.error('Failed to sync event', {
        eventId: event.eventId,
        type: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    processed: syncedEventIds.length,
    syncedEventIds,
    failedEventIds,
    invalidEventIds,
    capError,
    applications,
  };
}
