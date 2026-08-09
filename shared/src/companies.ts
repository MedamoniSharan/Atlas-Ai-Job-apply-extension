import { z } from 'zod';
import { platformSchema } from './events';

/** Normalize company names for cross-user dedupe. */
export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * URL-safe reversible key from a normalized company name.
 * Client/server encode the same way so `/companies/:key` round-trips.
 */
export function encodeCompanyKey(normalizedOrDisplayName: string): string {
  const normalized = normalizeCompanyName(normalizedOrDisplayName);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(normalized, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(normalized);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeCompanyKey(key: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(key, 'base64url').toString('utf8');
  }
  const padded = key.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Stable job identity across users (no userId). */
export function companyJobIdentity(job: {
  platform?: string;
  externalJobId?: string | null;
  url?: string | null;
  title?: string;
  company?: string;
}): string {
  const platform = (job.platform || 'unknown').toLowerCase();
  const ext = job.externalJobId?.trim();
  if (ext) return `${platform}|id:${ext}`;
  const url = job.url?.trim();
  if (url) {
    try {
      const u = new URL(url);
      return `${platform}|url:${u.origin}${u.pathname}`.replace(/\/$/, '');
    } catch {
      return `${platform}|url:${url}`;
    }
  }
  return `${platform}|title:${(job.title || '').trim().toLowerCase()}@${normalizeCompanyName(job.company || '')}`;
}

/** True when URL looks like a real employer logo (not Naukri/brand placeholders). */
export function isUsableCompanyLogo(url?: string | null): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  if (!/^https?:\/\//i.test(raw)) return false;
  const u = raw.toLowerCase();
  if (
    /\/logo\.png(?:\?|$)/.test(u) ||
    /naukri[-_]?logo/.test(u) ||
    /\/static\/(?:images\/)?(?:logo|naukri)/.test(u) ||
    /placeholder|default[_-]?logo|no[_-]?logo|blank\.(?:gif|png|svg)/.test(u) ||
    /\/ni-gnb|profile\/photo|\/avatar|\/user\/|\/np\//.test(u) ||
    /img\.naukimg\.com\/logo(?:\.png)?(?:\?|$)/.test(u) ||
    // Naukri UI chrome / awards / Next static assets mistaken for logos
    /\/_next\/static\/media\//.test(u) ||
    /award[-_]?(?:left|right)[-_]?wing/.test(u) ||
    /award[-_]?wing|laurel|badge[-_]?icon/.test(u) ||
    /static\.naukimg\.com\/s\/9\//.test(u) ||
    /naukri[-_]identity|naukri[_-]gnb|gnb[_-]logo/.test(u) ||
    /static\.naukimg\.com\/s\/0\/0\//.test(u)
  ) {
    return false;
  }
  return true;
}

function logoQualityScore(url: string): number {
  const u = url.toLowerCase();
  let score = 1;
  if (u.includes('logo_images/groups')) score += 6;
  if (u.includes('/logo/get/') || u.includes('company_logo')) score += 5;
  if (u.includes('comp-logo') || u.includes('complogo')) score += 2;
  if (u.includes('naukimg.com')) score += 1;
  if (/\.(?:png|jpg|jpeg|webp|svg)(?:\?|$)/.test(u)) score += 1;
  if (/\.gif(?:\?|$)/.test(u) && u.includes('logo_images')) score += 1;
  return score;
}

/** Pick the strongest usable employer logo from candidates. */
export function pickBestCompanyLogo(
  ...urls: Array<string | null | undefined>
): string | undefined {
  let best: string | undefined;
  let bestScore = -1;
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || !isUsableCompanyLogo(trimmed)) continue;
    const score = logoQualityScore(trimmed);
    if (score > bestScore) {
      best = trimmed;
      bestScore = score;
    }
  }
  return best;
}

/** Apply a company-level logo onto every job missing a usable one. */
export function withCompanyLogos<T extends { companyLogo?: string }>(
  jobs: T[],
  companyLogo?: string | null
): T[] {
  const fallback = pickBestCompanyLogo(companyLogo);
  if (!fallback && jobs.every((j) => isUsableCompanyLogo(j.companyLogo))) {
    return jobs;
  }
  return jobs.map((job) => {
    const logo = pickBestCompanyLogo(job.companyLogo, fallback);
    if (!logo) {
      if (!job.companyLogo) return job;
      const { companyLogo: _drop, ...rest } = job;
      return rest as T;
    }
    if (job.companyLogo === logo) return job;
    return { ...job, companyLogo: logo };
  });
}

const ABOUT_CUT_RE =
  /\b(?:Life of a|Company Info(?:\s*Link)?|Address\b|Careers at|Open Source Technologies|Cloud\s*&\s*DevOps(?:\s+Practice)?|Learn more\b|Website\b)/i;

/** Repair common UTF-8 / Windows-1252 mojibake from scraped Naukri copy. */
function repairMojibake(text: string): string {
  return text
    .replace(/â€™|€™|Ã¢â‚¬â„¢/g, "'")
    .replace(/â€˜|€˜|Ã¢â‚¬Ëœ/g, "'")
    .replace(/â€œ|€œ|Ã¢â‚¬Å“/g, '"')
    .replace(/â€|€|Ã¢â‚¬Â/g, '"')
    .replace(/â€”|€”|Ã¢â‚¬â€/g, '—')
    .replace(/â€“|€“|Ã¢â‚¬â€œ/g, '–')
    .replace(/â€¦|€¦/g, '…')
    .replace(/Â(?=\s)/g, '')
    .replace(/Ã /g, ' ');
}

/**
 * Clean Naukri "About company" blobs: fix mashed words, drop chrome
 * (ratings, followers, Life of a…), keep a readable overview.
 */
export function sanitizeAboutCompany(
  raw?: string | null,
  opts: { maxLen?: number; maxSentences?: number } = {}
): string | undefined {
  const maxLen = opts.maxLen ?? 1200;
  const maxSentences = opts.maxSentences ?? 8;
  if (!raw?.trim()) return undefined;

  let text = repairMojibake(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/^(?:about\s+(?:the\s+)?company[:\s-]*)+/i, '')
    // "About Accenture Accenture is…" → "Accenture is…"
    .replace(/^about\s+(.+?)\s+\1\b/i, '$1')
    .replace(/^about\s+[A-Za-z0-9&.\-]{2,40}\s+(?=[A-Z])/i, '')
    .trim();

  // Insert missing spaces at common mash boundaries.
  text = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .replace(/(https?:\/\/\S+?)([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop a leftover short "About Name" lead-in after spacing fixes.
  text = text
    .replace(/^about\s+(.+?)\s+\1\b/i, '$1')
    .replace(/^about\s+[A-Za-z0-9&.\-]{2,40}\s+(?=[A-Z])/i, '');

  const overviewIdx = text.search(/\bOverview\b/i);
  if (overviewIdx >= 0) {
    const after = text
      .slice(overviewIdx)
      .replace(/^\s*Overview\b[:\s]*/i, '')
      .trim();
    if (after.length > 60) text = after;
  }

  const cutAt = text.search(ABOUT_CUT_RE);
  if (cutAt > 80) text = text.slice(0, cutAt).trim();

  text = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(
      /^(?:[\d.]+\s+)?(?:[\d,.]+[kKmM]?\+?\s+)?(?:employee\s+)?reviews?\b/i,
      ''
    )
    .replace(
      /\b(?:IT Services(?:\s*&\s*Consulting)?|Foreign MNC|Indian MNC|Startup|Corporate|Following|[\d,.]+[kKmM]?\+?\s+followers?)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 40) return false;
      if (
        /^(?:Life of|Lead |Delivery Manager|Design Engineer|Data Solution|Company Info)/i.test(
          s
        )
      ) {
        return false;
      }
      if (
        /\b(?:Newtown|Pennsylvania|followers|employee reviews)\b/i.test(s) &&
        s.length < 90
      ) {
        return false;
      }
      return /[a-z]{3,}/.test(s);
    });

  if (sentences.length) {
    text = sentences.slice(0, Math.max(1, maxSentences)).join(' ');
  }

  if (text.length < 40) return undefined;
  if (text.length > maxLen) {
    // Prefer cutting on a sentence boundary instead of mid-word ("O...").
    const hard = text.slice(0, maxLen);
    const lastSentence = Math.max(
      hard.lastIndexOf('. '),
      hard.lastIndexOf('! '),
      hard.lastIndexOf('? ')
    );
    if (lastSentence > maxLen * 0.45) {
      return hard.slice(0, lastSentence + 1).trim();
    }
    const clipped = hard.replace(/\s+\S*$/, '').trim();
    return `${clipped || hard.trim()}…`;
  }
  return text;
}

export const companySummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  companyLogo: z.string().optional(),
  aboutCompany: z.string().optional(),
  opportunityCount: z.number().int().nonnegative(),
});

export type CompanySummary = z.infer<typeof companySummarySchema>;

export const companyDetailSchema = companySummarySchema;

export type CompanyDetail = z.infer<typeof companyDetailSchema>;

export const companyJobSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  externalJobId: z.string().optional(),
  title: z.string(),
  company: z.string(),
  companyLogo: z.string().optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  snippet: z.string().optional(),
  experience: z.string().optional(),
  salary: z.string().optional(),
  postedAt: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  industry: z.string().optional(),
  employmentType: z.string().optional(),
});

export type CompanyJob = z.infer<typeof companyJobSchema>;

export const companiesListResponseSchema = z.object({
  items: z.array(companySummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

export type CompaniesListResponse = z.infer<typeof companiesListResponseSchema>;

export const companyJobsListResponseSchema = z.object({
  company: companyDetailSchema,
  items: z.array(companyJobSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

export type CompanyJobsListResponse = z.infer<
  typeof companyJobsListResponseSchema
>;
