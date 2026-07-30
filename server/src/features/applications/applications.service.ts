import { Application, Platform } from '@cosmo/shared';
import { FilterQuery } from 'mongoose';
import { ApplicationModel, IApplication } from './application.model';

export type ApplicationBucket = 'all' | 'matched' | 'applied' | 'skipped' | 'company_site';

export type ListApplicationsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  bucket?: ApplicationBucket;
  platform?: Platform | 'all';
  source?: 'all' | 'manual' | 'auto_scan' | 'auto_apply';
};

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
    metadata: doc.metadata as Application['metadata'],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function buildFilter(
  userId: string,
  query: ListApplicationsQuery
): FilterQuery<IApplication> {
  const filter: FilterQuery<IApplication> = { userId };
  const and: FilterQuery<IApplication>[] = [];

  const q = query.q?.trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({
      $or: [
        { title: rx },
        { company: rx },
        { location: rx },
        { description: rx },
        { experience: rx },
        { salary: rx },
        { skills: rx },
      ],
    });
  }

  const bucket = query.bucket ?? 'all';
  if (bucket === 'applied') {
    and.push({
      $or: [{ status: 'applied' }, { 'metadata.source': 'auto_apply' }],
      'metadata.skipped': { $ne: true },
    });
  } else if (bucket === 'company_site') {
    and.push({
      $or: [
        { 'metadata.companySiteApply': true },
        {
          'metadata.skipped': true,
          'metadata.skipReason': { $regex: /company site|external/i },
        },
      ],
      status: { $nin: ['applied'] },
      'metadata.source': { $ne: 'auto_apply' },
    });
  } else if (bucket === 'skipped') {
    and.push({
      'metadata.skipped': true,
      'metadata.companySiteApply': { $ne: true },
      'metadata.skipReason': { $not: { $regex: /company site|external/i } },
    });
  } else if (bucket === 'matched') {
    and.push({
      status: { $in: ['detected', 'viewed', 'saved'] },
      'metadata.skipped': { $ne: true },
      'metadata.companySiteApply': { $ne: true },
    });
  }

  if (query.platform && query.platform !== 'all') {
    filter.platform = query.platform;
  }

  if (query.source && query.source !== 'all') {
    filter['metadata.source'] = query.source;
  }

  if (and.length) {
    filter.$and = and;
  }

  return filter;
}

export async function listApplications(
  userId: string,
  query: ListApplicationsQuery = {}
): Promise<{
  items: Application[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 12));
  const skip = (page - 1) * limit;
  const filter = buildFilter(userId, query);

  const [items, total] = await Promise.all([
    ApplicationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ApplicationModel.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items: items.map(toApplication),
    total,
    page,
    limit,
    totalPages,
  };
}

function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url.split('?')[0]?.replace(/\/$/, '') || null;
  }
}

/**
 * Bulk lookup which jobs the user has already applied to (by externalJobId or URL).
 */
export async function lookupAppliedJobs(
  userId: string,
  input: { externalJobIds?: string[]; urls?: string[] }
): Promise<{ externalJobIds: string[]; urls: string[] }> {
  const externalJobIds = [
    ...new Set((input.externalJobIds ?? []).map((id) => id.trim()).filter(Boolean)),
  ].slice(0, 200);
  const urls = [
    ...new Set(
      (input.urls ?? [])
        .map((u) => normalizeUrl(u))
        .filter((u): u is string => Boolean(u))
    ),
  ].slice(0, 200);

  if (!externalJobIds.length && !urls.length) {
    return { externalJobIds: [], urls: [] };
  }

  const or: FilterQuery<IApplication>[] = [];
  if (externalJobIds.length) {
    or.push({ externalJobId: { $in: externalJobIds } });
  }
  if (urls.length) {
    or.push({ url: { $in: urls } });
  }

  const docs = await ApplicationModel.find({
    userId,
    $or: or,
    $and: [
      {
        $or: [{ status: 'applied' }, { 'metadata.source': 'auto_apply' }],
      },
      { 'metadata.skipped': { $ne: true } },
    ],
  })
    .select('externalJobId url')
    .lean();

  // Also match URLs that differ only by query string / trailing slash.
  let extraByUrl: Array<{ externalJobId?: string; url?: string }> = [];
  if (urls.length) {
    const pathHints = urls
      .map((u) => {
        try {
          return new URL(u).pathname.replace(/\/$/, '');
        } catch {
          return null;
        }
      })
      .filter((p): p is string => Boolean(p));
    if (pathHints.length) {
      extraByUrl = await ApplicationModel.find({
        userId,
        $and: [
          {
            $or: [{ status: 'applied' }, { 'metadata.source': 'auto_apply' }],
          },
          { 'metadata.skipped': { $ne: true } },
          {
            $or: pathHints.map((path) => ({
              url: { $regex: path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
            })),
          },
        ],
      })
        .select('externalJobId url')
        .limit(200)
        .lean();
    }
  }

  const appliedIds = new Set<string>();
  const appliedUrls = new Set<string>();
  for (const doc of [...docs, ...extraByUrl]) {
    if (doc.externalJobId) appliedIds.add(doc.externalJobId);
    const n = normalizeUrl(doc.url);
    if (n) appliedUrls.add(n);
  }

  return {
    externalJobIds: [...appliedIds],
    urls: [...appliedUrls],
  };
}

export type TrackerColumn =
  | 'matched'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'skipped';

export const TRACKER_COLUMNS = new Set<TrackerColumn>([
  'matched',
  'applied',
  'interview',
  'offer',
  'rejected',
  'skipped',
]);

/**
 * Move an application between Tracker Kanban columns.
 */
export async function moveApplicationColumn(
  userId: string,
  applicationId: string,
  column: TrackerColumn
): Promise<Application | null> {
  const doc = await ApplicationModel.findOne({ _id: applicationId, userId });
  if (!doc) return null;

  const metadata = {
    ...((doc.metadata as Record<string, unknown> | undefined) ?? {}),
  };

  const clearSkip = () => {
    metadata.skipped = false;
    delete metadata.skipReason;
    metadata.companySiteApply = false;
  };

  if (column === 'applied') {
    doc.status = 'applied';
    if (!doc.appliedAt) doc.appliedAt = new Date();
    clearSkip();
    if (metadata.source !== 'auto_apply' && metadata.source !== 'manual') {
      metadata.source = metadata.source ?? 'manual';
    }
  } else if (column === 'matched') {
    doc.status = 'detected';
    clearSkip();
    if (metadata.source === 'auto_apply') {
      metadata.source = 'auto_scan';
    }
  } else if (column === 'interview') {
    doc.status = 'interview';
    clearSkip();
  } else if (column === 'offer') {
    doc.status = 'offer';
    clearSkip();
  } else if (column === 'rejected') {
    doc.status = 'rejected';
    clearSkip();
  } else {
    // skipped
    if (doc.status === 'applied') {
      doc.status = 'detected';
    }
    metadata.skipped = true;
    if (!metadata.skipReason || typeof metadata.skipReason !== 'string') {
      metadata.skipReason = 'Moved to Skipped';
    }
    metadata.companySiteApply = false;
  }

  doc.metadata = metadata;
  doc.markModified('metadata');
  await doc.save();
  return toApplication(doc);
}

/** Bulk-move up to 50 applications into a tracker column. */
export async function moveApplicationsBulk(
  userId: string,
  ids: string[],
  column: TrackerColumn
): Promise<{ items: Application[]; moved: number; missing: string[] }> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    50
  );
  const items: Application[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const updated = await moveApplicationColumn(userId, id, column);
    if (updated) items.push(updated);
    else missing.push(id);
  }
  return { items, moved: items.length, missing };
}
