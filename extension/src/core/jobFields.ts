import type { JobPayload } from '@cosmo/shared';
import type { SearchResultJob } from '../adapters/naukriAdapter';
import type { ApplyQueueItem } from './storageManager';

function preferText(
  primary?: string | null,
  fallback?: string | null
): string | undefined {
  const a = primary?.trim();
  const b = fallback?.trim();
  if (a && b) return a.length >= b.length ? a : b;
  return a || b || undefined;
}

function preferList(
  primary?: string[] | null,
  fallback?: string[] | null
): string[] | undefined {
  if (primary?.length && fallback?.length) {
    return primary.length >= fallback.length ? primary : fallback;
  }
  if (primary?.length) return primary;
  if (fallback?.length) return fallback;
  return undefined;
}

/** Prefer detail-page scrape fields, fall back to search-card / queue item. */
export function mergeJobFields(
  primary: Partial<JobPayload> | undefined,
  fallback: Partial<SearchResultJob & ApplyQueueItem & JobPayload> | undefined,
  extras: Partial<JobPayload> = {}
): JobPayload {
  const title = primary?.title || fallback?.title || 'Unknown';
  const company = primary?.company || fallback?.company || 'Unknown';
  return {
    platform: 'naukri',
    title,
    company,
    location: preferText(primary?.location, fallback?.location),
    url: primary?.url || fallback?.url,
    externalJobId: primary?.externalJobId || fallback?.externalJobId,
    companyLogo: primary?.companyLogo || fallback?.companyLogo,
    description: preferText(primary?.description, fallback?.description),
    experience: preferText(
      primary?.experience,
      fallback?.experience ||
        (fallback as SearchResultJob | undefined)?.experienceText
    ),
    salary: preferText(
      primary?.salary,
      fallback?.salary || (fallback as SearchResultJob | undefined)?.salaryText
    ),
    skills: preferList(primary?.skills, fallback?.skills),
    rating: preferText(primary?.rating, fallback?.rating),
    reviews: preferText(primary?.reviews, fallback?.reviews),
    postedAt: preferText(primary?.postedAt, fallback?.postedAt),
    openings: preferText(primary?.openings, fallback?.openings),
    applicants: preferText(primary?.applicants, fallback?.applicants),
    highlights: preferList(primary?.highlights, fallback?.highlights),
    role: preferText(primary?.role, fallback?.role),
    industry: preferText(primary?.industry, fallback?.industry),
    department: preferText(primary?.department, fallback?.department),
    employmentType: preferText(
      primary?.employmentType,
      fallback?.employmentType
    ),
    roleCategory: preferText(primary?.roleCategory, fallback?.roleCategory),
    education: preferText(primary?.education, fallback?.education),
    aboutCompany: preferText(primary?.aboutCompany, fallback?.aboutCompany),
    status: 'detected',
    ...extras,
  };
}

/** How complete a JD scrape is — used to decide whether to retry. */
export function jobDetailRichness(job: Partial<JobPayload> | null | undefined): number {
  if (!job) return 0;
  let score = 0;
  if (job.title) score += 1;
  if (job.company) score += 1;
  if (job.location) score += 1;
  if (job.experience) score += 1;
  if (job.salary) score += 2;
  if (job.description && job.description.length > 200) score += 3;
  else if (job.description && job.description.length > 80) score += 1;
  if (job.skills && job.skills.length >= 3) score += 2;
  else if (job.skills?.length) score += 1;
  if (job.role) score += 1;
  if (job.industry) score += 1;
  if (job.department) score += 1;
  if (job.employmentType) score += 1;
  if (job.education) score += 1;
  if (job.aboutCompany && job.aboutCompany.length > 40) score += 1;
  if (job.highlights?.length) score += 1;
  if (job.openings) score += 1;
  if (job.applicants) score += 1;
  if (job.postedAt) score += 1;
  return score;
}
