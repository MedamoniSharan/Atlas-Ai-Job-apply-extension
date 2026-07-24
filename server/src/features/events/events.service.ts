import {
  getEffectivePlan,
  getPlanAppliesLimit,
  getPlanAppliesPerDay,
  getPlanAppliesPerHour,
  jobPayloadSchema,
  type EventEnvelope,
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
  hourRange,
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

  const hour = hourRange();
  const day = dayRange();
  const month = monthRange();

  const [hourUsed, dayUsed, monthUsed] = await Promise.all([
    ApplicationModel.countDocuments(appliedCountFilter(userId, hour)),
    ApplicationModel.countDocuments(appliedCountFilter(userId, day)),
    ApplicationModel.countDocuments(appliedCountFilter(userId, month)),
  ]);

  const plan = getEffectivePlan(user.plan, user.planExpiresAt);
  const hourLimit = getPlanAppliesPerHour(user.plan, user.planExpiresAt);
  const dayLimit = getPlanAppliesPerDay(user.plan, user.planExpiresAt);
  const monthLimit = getPlanAppliesLimit(user.plan, user.planExpiresAt);

  if (hourUsed >= hourLimit) {
    throw new AppError(
      `Hourly safety limit reached (${hourLimit}/hour on ${plan})`,
      429,
      'APPLY_HOUR_CAP'
    );
  }
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

async function upsertApplicationFromEvent(
  userId: string,
  event: EventEnvelope
) {
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

  if (countsAsApply(event, status)) {
    await assertApplyCaps(userId);
  }

  const filter =
    job.externalJobId && job.externalJobId.length > 0
      ? { userId, platform: job.platform, externalJobId: job.externalJobId }
      : { userId, eventId: event.eventId };

  const richFields: Record<string, unknown> = {};
  if (job.companyLogo) richFields.companyLogo = job.companyLogo;
  if (job.description) richFields.description = job.description;
  if (job.experience) richFields.experience = job.experience;
  if (job.salary) richFields.salary = job.salary;
  if (job.skills?.length) richFields.skills = job.skills;
  if (job.rating) richFields.rating = job.rating;
  if (job.reviews) richFields.reviews = job.reviews;
  if (job.postedAt) richFields.postedAt = job.postedAt;
  if (job.openings) richFields.openings = job.openings;
  if (job.applicants) richFields.applicants = job.applicants;
  if (job.highlights?.length) richFields.highlights = job.highlights;
  if (job.role) richFields.role = job.role;
  if (job.industry) richFields.industry = job.industry;
  if (job.department) richFields.department = job.department;
  if (job.employmentType) richFields.employmentType = job.employmentType;
  if (job.roleCategory) richFields.roleCategory = job.roleCategory;
  if (job.education) richFields.education = job.education;
  if (job.aboutCompany) richFields.aboutCompany = job.aboutCompany;
  if (job.location) richFields.location = job.location;
  if (job.url) richFields.url = job.url;

  const existing = await ApplicationModel.findOne(filter).lean();
  const mergedMetadata = {
    ...((existing?.metadata as Record<string, unknown> | undefined) ?? {}),
    ...(job.metadata ?? {}),
  };

  const doc = await ApplicationModel.findOneAndUpdate(
    filter,
    {
      $set: {
        platform: job.platform,
        externalJobId: job.externalJobId,
        title: job.title,
        company: job.company,
        status,
        appliedAt: job.appliedAt ? new Date(job.appliedAt) : undefined,
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

  return toApplication(doc);
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

export async function syncEvents(
  userId: string,
  body: { events: EventEnvelope[] }
): Promise<{ processed: number; applications: ReturnType<typeof toApplication>[] }> {
  const applications: ReturnType<typeof toApplication>[] = [];

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

    if (event.type === 'ExtensionConnected') {
      await handleExtensionConnected(userId, event);
    }

    const app = await upsertApplicationFromEvent(userId, event);
    if (app) {
      applications.push(app);
      const io = getIo();
      io?.to(`user:${userId}`).emit('application.updated', app);
    }
  }

  return { processed: body.events.length, applications };
}
