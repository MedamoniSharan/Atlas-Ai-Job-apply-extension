import {
  CompanyDetail,
  CompanyJob,
  CompaniesListResponse,
  CompanyJobsListResponse,
  companyJobIdentity,
  decodeCompanyKey,
  encodeCompanyKey,
  normalizeCompanyName,
  pickBestCompanyLogo,
  sanitizeAboutCompany,
  withCompanyLogos,
} from '@cosmo/shared';
import { ApplicationModel, IApplication } from '../applications/application.model';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickBetterAbout(a?: string | null, b?: string | null): string | undefined {
  const left = sanitizeAboutCompany(a, { maxLen: 4000 });
  const right = sanitizeAboutCompany(b, { maxLen: 4000 });
  if (!left) return right || undefined;
  if (!right) return left;
  return right.length > left.length ? right : left;
}

function displayCompanyName(docs: Array<{ company?: string }>): string {
  const counts = new Map<string, number>();
  for (const d of docs) {
    const name = d.company?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return best || 'Unknown';
}

function richness(doc: IApplication): number {
  let score = 0;
  if (pickBestCompanyLogo(doc.companyLogo)) score += 2;
  if (doc.aboutCompany) score += Math.min(4, Math.floor(doc.aboutCompany.length / 80));
  if (doc.description) score += Math.min(3, Math.floor(doc.description.length / 120));
  if (doc.salary) score += 1;
  if (doc.location) score += 1;
  if (doc.experience) score += 1;
  return score;
}

function toCompanyJob(doc: IApplication): CompanyJob {
  const description = doc.description?.trim() || undefined;
  const snippet = description
    ? description.length > 220
      ? `${description.slice(0, 217).trim()}…`
      : description
    : doc.aboutCompany?.trim()
      ? doc.aboutCompany.length > 220
        ? `${doc.aboutCompany.slice(0, 217).trim()}…`
        : doc.aboutCompany.trim()
      : undefined;

  const companyLogo = pickBestCompanyLogo(doc.companyLogo);

  return {
    id: companyJobIdentity({
      platform: doc.platform,
      externalJobId: doc.externalJobId,
      url: doc.url,
      title: doc.title,
      company: doc.company,
    }),
    platform: doc.platform,
    externalJobId: doc.externalJobId,
    title: doc.title,
    company: doc.company,
    ...(companyLogo ? { companyLogo } : {}),
    location: doc.location,
    url: doc.url,
    description,
    snippet,
    experience: doc.experience,
    salary: doc.salary,
    postedAt: doc.postedAt,
    role: doc.role,
    department: doc.department,
    industry: doc.industry,
    employmentType: doc.employmentType,
  };
}

function dedupeJobs(docs: IApplication[]): CompanyJob[] {
  const bestById = new Map<string, { job: CompanyJob; score: number }>();
  for (const doc of docs) {
    const job = toCompanyJob(doc);
    const score = richness(doc);
    const prev = bestById.get(job.id);
    if (!prev || score > prev.score) {
      bestById.set(job.id, { job, score });
    }
  }
  return Array.from(bestById.values())
    .map((v) => v.job)
    .sort((a, b) => a.title.localeCompare(b.title));
}

type CompanyBucket = {
  normalized: string;
  name: string;
  companyLogo?: string;
  aboutCompany?: string;
  jobs: CompanyJob[];
};

async function loadCompanyBuckets(q?: string): Promise<CompanyBucket[]> {
  const filter: Record<string, unknown> = {
    company: { $exists: true, $nin: [null, ''] },
  };
  const query = q?.trim();
  if (query) {
    filter.company = {
      $regex: escapeRegex(query),
      $options: 'i',
    };
  }

  const docs = await ApplicationModel.find(filter)
    .select(
      'platform externalJobId title company location url companyLogo description experience salary postedAt role department industry employmentType aboutCompany'
    )
    .lean<IApplication[]>();

  const byNorm = new Map<
    string,
    {
      docs: IApplication[];
      logo?: string;
      about?: string;
    }
  >();

  for (const doc of docs) {
    const normalized = normalizeCompanyName(doc.company || '');
    if (!normalized) continue;
    let bucket = byNorm.get(normalized);
    if (!bucket) {
      bucket = { docs: [] };
      byNorm.set(normalized, bucket);
    }
    bucket.docs.push(doc);
    bucket.logo = pickBestCompanyLogo(bucket.logo, doc.companyLogo);
    bucket.about = pickBetterAbout(bucket.about, doc.aboutCompany);
  }

  const buckets: CompanyBucket[] = [];
  for (const [normalized, bucket] of byNorm) {
    const jobs = withCompanyLogos(dedupeJobs(bucket.docs), bucket.logo);
    if (!jobs.length) continue;
    const companyLogo =
      pickBestCompanyLogo(
        bucket.logo,
        ...jobs.map((j) => j.companyLogo)
      ) || undefined;
    buckets.push({
      normalized,
      name: displayCompanyName(bucket.docs),
      companyLogo,
      aboutCompany: bucket.about,
      jobs: withCompanyLogos(jobs, companyLogo),
    });
  }

  buckets.sort((a, b) => {
    const aLogo = a.companyLogo ? 1 : 0;
    const bLogo = b.companyLogo ? 1 : 0;
    if (bLogo !== aLogo) return bLogo - aLogo;
    if (b.jobs.length !== a.jobs.length) return b.jobs.length - a.jobs.length;
    return a.name.localeCompare(b.name);
  });
  return buckets;
}

function toSummary(bucket: CompanyBucket) {
  const about = sanitizeAboutCompany(bucket.aboutCompany, { maxLen: 220 });
  return {
    key: encodeCompanyKey(bucket.normalized),
    name: bucket.name,
    companyLogo: bucket.companyLogo,
    aboutCompany: about,
    opportunityCount: bucket.jobs.length,
  };
}

function toDetail(bucket: CompanyBucket): CompanyDetail {
  return {
    key: encodeCompanyKey(bucket.normalized),
    name: bucket.name,
    companyLogo: bucket.companyLogo,
    aboutCompany: sanitizeAboutCompany(bucket.aboutCompany, {
      maxLen: 4000,
      maxSentences: 16,
    }),
    opportunityCount: bucket.jobs.length,
  };
}

export async function listCompanies(opts: {
  q?: string;
  page?: number;
  limit?: number;
}): Promise<CompaniesListResponse> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(60, Math.max(1, opts.limit ?? 24));
  const buckets = await loadCompanyBuckets(opts.q);
  const total = buckets.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const items = buckets.slice(start, start + limit).map(toSummary);
  return { items, total, page, limit, totalPages };
}

export async function getCompany(key: string): Promise<CompanyDetail | null> {
  let normalized: string;
  try {
    normalized = normalizeCompanyName(decodeCompanyKey(key));
  } catch {
    return null;
  }
  if (!normalized) return null;

  const buckets = await loadCompanyBuckets();
  const bucket = buckets.find((b) => b.normalized === normalized);
  return bucket ? toDetail(bucket) : null;
}

export async function listCompanyJobs(
  key: string,
  opts: { q?: string; page?: number; limit?: number }
): Promise<CompanyJobsListResponse | null> {
  let normalized: string;
  try {
    normalized = normalizeCompanyName(decodeCompanyKey(key));
  } catch {
    return null;
  }
  if (!normalized) return null;

  const buckets = await loadCompanyBuckets();
  const bucket = buckets.find((b) => b.normalized === normalized);
  if (!bucket) return null;

  const q = opts.q?.trim().toLowerCase();
  let jobs = bucket.jobs;
  if (q) {
    jobs = jobs.filter((job) => {
      const hay = [
        job.title,
        job.location,
        job.salary,
        job.snippet,
        job.description,
        job.role,
        job.department,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(60, Math.max(1, opts.limit ?? 24));
  const total = jobs.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;

  return {
    company: toDetail(bucket),
    items: jobs.slice(start, start + limit),
    total,
    page,
    limit,
    totalPages,
  };
}
