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
  /** Inclusive lower bound (ISO). Filters by createdAt. */
  from?: string;
  /** Exclusive upper bound (ISO). Filters by createdAt. */
  to?: string;
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

  const createdAt: Record<string, Date> = {};
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) createdAt.$lt = to;
  }
  if (Object.keys(createdAt).length) {
    and.push({ createdAt });
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

export type ApplicationStatsQuery = {
  from?: string;
  to?: string;
};

export type ApplicationStats = {
  period: {
    from?: string;
    to?: string;
    all: number;
    matched: number;
    applied: number;
    skipped: number;
    company_site: number;
    auto_apply: number;
  };
  lifetime: {
    all: number;
    applied: number;
  };
};

/** Bucket + auto-apply counts for a window, plus lifetime totals — one round-trip for the dashboard. */
export async function getApplicationStats(
  userId: string,
  query: ApplicationStatsQuery = {}
): Promise<ApplicationStats> {
  const range = { from: query.from, to: query.to };
  const count = (partial: ListApplicationsQuery) =>
    ApplicationModel.countDocuments(buildFilter(userId, partial));

  const [
    all,
    matched,
    applied,
    skipped,
    company_site,
    auto_apply,
    lifetimeAll,
    lifetimeApplied,
  ] = await Promise.all([
    count({ ...range, bucket: 'all' }),
    count({ ...range, bucket: 'matched' }),
    count({ ...range, bucket: 'applied' }),
    count({ ...range, bucket: 'skipped' }),
    count({ ...range, bucket: 'company_site' }),
    count({ ...range, source: 'auto_apply' }),
    count({ bucket: 'all' }),
    count({ bucket: 'applied' }),
  ]);

  return {
    period: {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      all,
      matched,
      applied,
      skipped,
      company_site,
      auto_apply,
    },
    lifetime: {
      all: lifetimeAll,
      applied: lifetimeApplied,
    },
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

/** Permanently delete one application owned by the user. */
export async function deleteApplication(
  userId: string,
  applicationId: string
): Promise<boolean> {
  const result = await ApplicationModel.deleteOne({
    _id: applicationId,
    userId,
  });
  return result.deletedCount === 1;
}

/** Bulk-delete up to 50 applications. */
export async function deleteApplicationsBulk(
  userId: string,
  ids: string[]
): Promise<{ deleted: string[]; deletedCount: number; missing: string[] }> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    50
  );
  const deleted: string[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const ok = await deleteApplication(userId, id);
    if (ok) deleted.push(id);
    else missing.push(id);
  }
  return { deleted, deletedCount: deleted.length, missing };
}
