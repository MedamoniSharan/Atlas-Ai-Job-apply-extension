import type { JobPayload } from '@atlas/shared';
import type { SearchResultJob } from '../adapters/naukriAdapter';
import type { ApplyQueueItem } from './storageManager';

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
    location: primary?.location || fallback?.location,
    url: primary?.url || fallback?.url,
    externalJobId: primary?.externalJobId || fallback?.externalJobId,
    companyLogo: primary?.companyLogo || fallback?.companyLogo,
    description: primary?.description || fallback?.description,
    experience:
      primary?.experience ||
      fallback?.experience ||
      (fallback as SearchResultJob | undefined)?.experienceText,
    salary:
      primary?.salary ||
      fallback?.salary ||
      (fallback as SearchResultJob | undefined)?.salaryText,
    skills:
      primary?.skills?.length ? primary.skills : fallback?.skills,
    rating: primary?.rating || fallback?.rating,
    reviews: primary?.reviews || fallback?.reviews,
    postedAt: primary?.postedAt || fallback?.postedAt,
    openings: primary?.openings || fallback?.openings,
    applicants: primary?.applicants || fallback?.applicants,
    highlights:
      primary?.highlights?.length ? primary.highlights : fallback?.highlights,
    role: primary?.role || fallback?.role,
    industry: primary?.industry || fallback?.industry,
    department: primary?.department || fallback?.department,
    employmentType: primary?.employmentType || fallback?.employmentType,
    roleCategory: primary?.roleCategory || fallback?.roleCategory,
    education: primary?.education || fallback?.education,
    aboutCompany: primary?.aboutCompany || fallback?.aboutCompany,
    status: 'detected',
    ...extras,
  };
}
