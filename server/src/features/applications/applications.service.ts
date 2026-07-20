import { Application, Platform } from '@atlas/shared';
import { FilterQuery } from 'mongoose';
import { ApplicationModel, IApplication } from './application.model';

export type ApplicationBucket = 'all' | 'matched' | 'applied' | 'skipped';

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
  } else if (bucket === 'skipped') {
    and.push({ 'metadata.skipped': true });
  } else if (bucket === 'matched') {
    and.push({
      status: { $in: ['detected', 'viewed', 'saved'] },
      'metadata.skipped': { $ne: true },
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
  const limit = Math.min(100, Math.max(1, query.limit ?? 12));
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
