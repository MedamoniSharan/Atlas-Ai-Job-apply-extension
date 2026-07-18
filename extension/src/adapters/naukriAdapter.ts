import type { JobPayload, JobPreferences } from '@atlas/shared';
import {
  PlatformAdapter,
  SelectorRegistry,
  textOf,
  queryFirst,
} from './types';

/**
 * Naukri selectors are centralized so DOM changes only require registry updates.
 */
export const naukriSelectors: SelectorRegistry = {
  title: [
    'h1.jd-header-title',
    '.jd-header .styles_jd-header-title__',
    '[class*="jd-header-title"]',
    'h1',
  ],
  company: [
    '[class*="jd-header-comp-name"] a',
    '.jd-header-comp-name a',
    '.jd-header-comp-name',
    '[class*="jd-header-comp-name"]',
    'a.comp-name',
  ],
  location: [
    '.loc span',
    '.location',
    '[class*="location"]',
    '.styles_jhc__location__',
  ],
  applySuccess: [
    '.apply-message',
    '[class*="apply-message"]',
    '.already-applied',
    '[class*="already-applied"]',
    '[class*="apply-success"]',
    '[class*="applied-success"]',
    '.apply-status-message',
  ],
  loggedIn: [
    '.nI-gNb-drawer__icon',
    '.nI-gNb-drawer',
    '.nI-gNb-icon-and-drawer',
    '.nI-gNb-info__subtxt',
    '.nI-gNb-info__name',
    'img.nI-gNb-icon-img',
    '[data-ga-track*="profile"]',
    '[data-ga-track*="Profile"]',
    '.user-name',
    '[class*="user-name"]',
    'a[href*="my.naukri.com"]',
    'a[href*="mnjuser"]',
    'a[href*="/mnj/"]',
    'a[href*="logout"]',
  ],
  loggedOut: [
    '#login_Layer',
    '#register_Layer',
    'a.nI-gNb-lg-rg__login',
    'a.nI-gNb-lg-rg__register',
  ],
  easyApply: [
    'button.styles_apply-button__uJI3A',
    'button.apply-button',
    '[class*="apply-button"]',
    'button#apply-button',
  ],
  searchCards: [
    '.srp-jobtuple-wrapper',
    '.cust-job-tuple',
    'article.jobTuple',
    '[class*="jobTuple"]',
    '.styles_job-listing-container__',
  ],
};

export type SearchResultJob = {
  title: string;
  company: string;
  location?: string;
  url: string;
  externalJobId?: string;
  experienceText?: string;
  salaryText?: string;
  companyLogo?: string;
  description?: string;
  skills?: string[];
  rating?: string;
  reviews?: string;
  postedAt?: string;
  /** True when Naukri only offers apply on the employer site (not Easy Apply). */
  companySiteApply?: boolean;
};

export function jobIdFromUrl(url: string): string | undefined {
  const match = url.match(/(\d{8,})(?:\?|#|$)/);
  return match?.[1];
}

function cleanText(value?: string | null): string | undefined {
  const t = value?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

function cleanCompany(value?: string | null): string {
  return (
    cleanText(value)?.replace(/\s*Reviews?.*$/i, '').trim() || 'Unknown'
  );
}

function isElementVisible(el: Element | null | undefined): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;

  const inline = el.getAttribute('style') || '';
  if (/display\s*:\s*none/i.test(inline) || /visibility\s*:\s*hidden/i.test(inline)) {
    return false;
  }

  const view = el.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    try {
      const cs = view.getComputedStyle(el);
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        cs.opacity === '0'
      ) {
        return false;
      }
    } catch {
      /* jsdom / detached */
    }
  }

  return true;
}

function hasLoggedInSignal(doc: Document): boolean {
  if (queryFirst(naukriSelectors.loggedIn, doc)) return true;

  // Profile photo / avatar in the global nav.
  const avatars = Array.from(
    doc.querySelectorAll(
      '.nI-gNb-header img, .nI-gNb-gnb img, header img, [class*="drawer"] img'
    )
  );
  for (const img of avatars) {
    const src = (img.getAttribute('src') || '').toLowerCase();
    if (
      src.includes('profile') ||
      src.includes('photo') ||
      src.includes('avatar') ||
      src.includes('ni-gnb') ||
      /\/user|\/u\//i.test(src)
    ) {
      return true;
    }
  }

  // Visible account name next to the avatar (not "Login").
  const nameEls = Array.from(
    doc.querySelectorAll(
      '.nI-gNb-info__subtxt, .nI-gNb-info__name, .nI-gNb-drawer span, [class*="userName"]'
    )
  );
  for (const el of nameEls) {
    const text = cleanText(el.textContent) || '';
    if (
      text &&
      !/^login$/i.test(text) &&
      !/^register$/i.test(text) &&
      text.length >= 2 &&
      isElementVisible(el)
    ) {
      return true;
    }
  }

  return false;
}

function hasVisibleLoggedOutSignal(doc: Document): boolean {
  for (const selector of naukriSelectors.loggedOut) {
    const el = doc.querySelector(selector);
    if (el && isElementVisible(el)) return true;
  }
  return false;
}

function absoluteUrl(src?: string | null): string | undefined {
  if (!src || src.startsWith('data:')) return undefined;
  try {
    return new URL(src, 'https://www.naukri.com').href;
  } catch {
    return undefined;
  }
}

function firstMatchingText(
  doc: Document | Element,
  selectors: string[]
): string | undefined {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = cleanText(el?.textContent);
    if (text) return text;
  }
  return undefined;
}

function uniqueStrings(values: Array<string | undefined>, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= max) break;
  }
  return out;
}

/** Pull "Label: value" or adjacent label/value pairs from Naukri detail rows. */
function labeledDetail(doc: Document, labels: string[]): string | undefined {
  const wanted = labels.map((l) => l.toLowerCase());
  const nodes = Array.from(
    doc.querySelectorAll(
      '[class*="details"], [class*="other-details"], [class*="job-details"], [class*="JD"], label, dt, .label, [class*="label"]'
    )
  );

  for (const node of nodes) {
    const labelText = cleanText(node.textContent)?.toLowerCase() || '';
    const matched = wanted.find((w) => labelText === w || labelText.startsWith(`${w}:`));
    if (!matched) continue;

    if (labelText.includes(':')) {
      const after = cleanText(node.textContent)?.split(':').slice(1).join(':');
      if (after && after.length > 1) return after;
    }

    const sibling =
      (node.nextElementSibling as HTMLElement | null) ??
      (node.parentElement?.querySelector(
        'span, a, [class*="value"], dd'
      ) as HTMLElement | null);
    const siblingText = cleanText(sibling?.textContent);
    if (siblingText && siblingText.toLowerCase() !== matched) return siblingText;
  }

  // Fallback: scan body lines "Role\nTechnology / IT"
  const body = doc.body?.innerText || '';
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\n]\\s*([^\\n]{2,120})`,
      'i'
    );
    const match = body.match(re);
    const value = cleanText(match?.[1]);
    if (value && !wanted.includes(value.toLowerCase())) return value;
  }

  return undefined;
}

function sectionByHeading(doc: Document, heading: RegExp, maxLen = 4000): string | undefined {
  const headings = Array.from(
    doc.querySelectorAll('h2, h3, h4, strong, [class*="title"], [class*="heading"]')
  );
  for (const h of headings) {
    const title = cleanText(h.textContent) || '';
    if (!heading.test(title)) continue;

    const parts: string[] = [];
    let el: Element | null = h.nextElementSibling;
    let hops = 0;
    while (el && hops < 12) {
      const tag = el.tagName.toLowerCase();
      const text = cleanText(el.textContent);
      if (
        (tag === 'h2' || tag === 'h3' || tag === 'h4') &&
        text &&
        text.length < 80
      ) {
        break;
      }
      if (text) parts.push(text);
      el = el.nextElementSibling;
      hops += 1;
    }

    // Also try parent container blocks
    if (!parts.length) {
      const parent = h.parentElement;
      const block = cleanText(parent?.textContent)
        ?.replace(title, '')
        .trim();
      if (block) parts.push(block);
    }

    const joined = cleanText(parts.join('\n'));
    if (joined) return joined.slice(0, maxLen);
  }

  // Text fallback
  const body = doc.body?.innerText || '';
  const match = body.match(
    new RegExp(
      `${heading.source}[\\s\\S]{0,40}?\\n([\\s\\S]{20,2500}?)(?=\\n(?:Role|Industry|Department|Employment|Education|Key Skills|About company|Report this job|Job highlights|Preferred)|$)`,
      'i'
    )
  );
  return cleanText(match?.[1])?.slice(0, maxLen);
}

function parseHeaderStats(doc: Document): {
  postedAt?: string;
  openings?: string;
  applicants?: string;
} {
  const blob =
    firstMatchingText(doc, [
      '[class*="stat"]',
      '[class*="posted"]',
      '[class*="jhc__"]',
      '.jd-header',
    ]) ||
    cleanText(
      Array.from(doc.querySelectorAll('[class*="stat"], [class*="posted-by"]'))
        .map((el) => el.textContent)
        .join(' | ')
    ) ||
    '';

  const bodySlice = (doc.body?.innerText || '').slice(0, 2500);
  const source = `${blob}\n${bodySlice}`;

  const postedAt =
    cleanText(source.match(/Posted\s*:\s*([^\n|]+)/i)?.[1]) ||
    cleanText(source.match(/(\d+\s*(?:day|days|hour|hours|minute|minutes)\s*ago)/i)?.[1]);
  const openings = cleanText(source.match(/Openings?\s*:\s*([^\n|]+)/i)?.[1]);
  const applicants = cleanText(source.match(/Applicants?\s*:\s*([^\n|]+)/i)?.[1]);

  return { postedAt, openings, applicants };
}

function parseRatingReviews(doc: Document): { rating?: string; reviews?: string } {
  const ratingNode = doc.querySelector(
    '.rating .main-2, [class*="rating"] .main-2, [class*="amb-rating"], [class*="rating"]'
  );
  let rating = cleanText(ratingNode?.textContent)?.match(/(\d+(?:\.\d+)?)/)?.[1];

  const headerComp = doc.querySelector(
    '[class*="jd-header-comp-name"], .jd-header-comp-name, [class*="comp-name"]'
  );
  const headerText = cleanText(headerComp?.textContent) || '';
  const reviewsMatch = headerText.match(/([\d,.]+[kKmM]?\+?)\s*Reviews?/i);
  const reviews = reviewsMatch
    ? `${reviewsMatch[1]} Reviews`
    : cleanText(
        doc.querySelector('[class*="reviews"], a[href*="reviews"]')?.textContent
      );

  if (!rating) {
    rating = headerText.match(/^(\d+(?:\.\d+)?)/)?.[1];
  }

  return { rating, reviews };
}

function scrapeHighlights(doc: Document): string[] {
  const roots = Array.from(
    doc.querySelectorAll(
      '[class*="highlight"], [class*="job-highlight"], [class*="styles_highlight"]'
    )
  );
  const items: string[] = [];
  for (const root of roots) {
    const lis = root.querySelectorAll('li, p, [class*="chip"], span');
    for (const li of Array.from(lis)) {
      const text = cleanText(li.textContent);
      if (
        text &&
        text.length > 12 &&
        !/^job highlights$/i.test(text) &&
        !/^keyskills$/i.test(text)
      ) {
        items.push(text);
      }
    }
  }

  if (!items.length) {
    const body = doc.body?.innerText || '';
    const block = body.match(
      /Job highlights\s*([\s\S]{20,900}?)(?=\n(?:Job match|Keyskills|Location|Work Experience|Job description|Role)|$)/i
    )?.[1];
    if (block) {
      for (const line of block.split('\n')) {
        const text = cleanText(line);
        if (text && text.length > 12) items.push(text);
      }
    }
  }

  return uniqueStrings(items, 12);
}

function scrapeSkills(doc: Document): string[] {
  const fromChips = Array.from(
    doc.querySelectorAll(
      '[class*="key-skill"] a, [class*="key-skill"] span, [class*="chip"] span, .chip, [class*="skills"] a, [class*="tag-li"]'
    )
  ).map((el) => cleanText(el.textContent));

  const filtered = fromChips.filter((s): s is string => {
    if (!s) return false;
    if (/^skills?$/i.test(s)) return false;
    if (/preferred keyskills/i.test(s)) return false;
    if (/highlighted with/i.test(s)) return false;
    if (s.length > 60) return false;
    return true;
  });

  return uniqueStrings(filtered, 40);
}

function scrapeFullDescription(doc: Document): string | undefined {
  const sections = [
    sectionByHeading(doc, /^role\s*&\s*responsibilities$/i, 5000),
    sectionByHeading(doc, /^preferred candidate profile$/i, 4000),
    sectionByHeading(doc, /^job description$/i, 6000),
  ].filter(Boolean) as string[];

  if (sections.length) {
    return uniqueStrings(sections, 6).join('\n\n').slice(0, 10000);
  }

  const selectors = [
    '[class*="job-desc"]',
    '[class*="styles_job-desc"]',
    '#job-description',
    '[class*="description"]',
    '.dang-inner-html',
  ];
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = cleanText(el?.textContent);
    if (text && text.length > 80) return text.slice(0, 10000);
  }

  return undefined;
}

function scrapeAboutCompany(doc: Document): string | undefined {
  return (
    sectionByHeading(doc, /^about (the )?company$/i, 3500) ||
    cleanText(
      doc.querySelector(
        '[class*="about-company"], [class*="comp-detail"], [class*="company-info"]'
      )?.textContent
    )?.slice(0, 3500)
  );
}

/** Naukri labels for employer-site / external apply (not in-platform Easy Apply). */
const COMPANY_SITE_APPLY_RE =
  /apply\s+(on|to)\s+(the\s+)?company(\s+web)?\s*site|company[- ]site|apply\s+on\s+company\s+website|external\s+apply|apply\s+externally|continue\s+to\s+company/i;

export function isCompanySiteApplyLabel(label: string): boolean {
  return COMPANY_SITE_APPLY_RE.test(label.replace(/\s+/g, ' ').trim());
}

/**
 * True when the only / primary apply path is the employer website.
 * Used on search cards and job detail pages.
 */
export function detectCompanySiteApply(root: Document | Element): boolean {
  const scope: Element =
    root instanceof Document
      ? root.querySelector(
          '[class*="jd-header"], [class*="styles_jhc"], [class*="apply-button"], .jd-header, header'
        ) ?? root.body ?? root.documentElement
      : root;

  const controls = Array.from(
    scope.querySelectorAll('button, a, [role="button"], [class*="apply"]')
  );
  let sawCompanySite = false;
  let sawEasyApply = false;

  for (const el of controls) {
    const label = cleanText(el.textContent) || '';
    if (!label || label.length > 80) continue;
    if (isCompanySiteApplyLabel(label)) {
      sawCompanySite = true;
      continue;
    }
    const lower = label.toLowerCase();
    if (
      lower === 'apply' ||
      lower.includes('easy apply') ||
      (lower.includes('apply') &&
        !/login|register|company|external|site|website/.test(lower))
    ) {
      sawEasyApply = true;
    }
  }

  if (sawCompanySite && !sawEasyApply) return true;

  // Search cards often put CTA text in the tuple without a clean button node.
  if (!(root instanceof Document)) {
    const blob = cleanText((root as HTMLElement).innerText?.slice(0, 1500));
    if (
      blob &&
      /apply\s+(on|to)\s+(the\s+)?company(\s+web)?\s*site/i.test(blob) &&
      !/\beasy apply\b/i.test(blob) &&
      !/(^|\n)\s*apply\s*(\n|$)/i.test(blob)
    ) {
      return true;
    }
  }

  return false;
}

export function buildNaukriSearchUrl(prefs: JobPreferences): string {
  const keywordParts = [...prefs.titles, ...prefs.keywords].filter(Boolean);
  const keyword = keywordParts.slice(0, 6).join(' ') || 'software developer';
  const location = prefs.locations[0] ?? '';
  const params = new URLSearchParams();
  params.set('k', keyword);
  if (location) params.set('l', location);
  if (prefs.experienceMin > 0 || prefs.experienceMax < 30) {
    params.set('experience', String(prefs.experienceMin));
  }
  const slug = keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://www.naukri.com/${slug}-jobs?${params.toString()}`;
}

export class NaukriAdapter implements PlatformAdapter {
  readonly platform = 'naukri' as const;

  matches(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.hostname !== 'www.naukri.com' && u.hostname !== 'naukri.com') {
        return false;
      }
      return (
        u.pathname.includes('/job-listings') ||
        u.pathname.includes('/jobdescription') ||
        /-\d+$/.test(u.pathname) ||
        u.pathname.includes('/jobs') ||
        /-jobs(?:\/|$)/.test(u.pathname)
      );
    } catch {
      return false;
    }
  }

  isSearchResultsPage(url: string = window.location.href): boolean {
    try {
      const u = new URL(url);
      return (
        /-jobs(?:\/|$)/.test(u.pathname) ||
        u.pathname.includes('/jobs-in-') ||
        u.searchParams.has('k')
      );
    } catch {
      return false;
    }
  }

  isLoggedIn(doc: Document = document): boolean {
    // Prefer positive account signals. Naukri often keeps #login_Layer in the
    // DOM (hidden) even after login, which used to cause false "logged out".
    if (hasLoggedInSignal(doc)) return true;

    if (hasVisibleLoggedOutSignal(doc)) return false;

    return false;
  }

  readJob(doc: Document = document): Partial<JobPayload> | null {
    const title = textOf(naukriSelectors.title, doc);
    const company = textOf(naukriSelectors.company, doc);
    if (!title || !company) return null;

    const location =
      textOf(naukriSelectors.location, doc) ||
      firstMatchingText(doc, [
        '.locWdth',
        '[class*="location"] span',
        '[class*="jhc__location"]',
      ]);
    const href = doc.location?.href ?? '';
    const externalJobId =
      doc.querySelector('[data-job-id]')?.getAttribute('data-job-id') ??
      jobIdFromUrl(href);

    const logoEl =
      (doc.querySelector(
        'img.logoImage, img[alt="companyLogo"], img[alt*="Company Logo" i], [class*="jd-header"] img, [class*="company-logo"] img, [class*="comp-logo"] img'
      ) as HTMLImageElement | null) ?? null;
    const companyLogo = absoluteUrl(logoEl?.getAttribute('src') || logoEl?.src);

    const experience =
      firstMatchingText(doc, [
        '.expwdth',
        '[class*="jhc__exp"]',
        '[class*="experience"] span',
        '[title*="experience" i]',
      ]) || undefined;
    const salary =
      firstMatchingText(doc, [
        '.sal',
        '[class*="jhc__salary"]',
        '[class*="salary"] span',
        '[title*="salary" i]',
      ]) || undefined;

    const { rating, reviews } = parseRatingReviews(doc);
    const { postedAt, openings, applicants } = parseHeaderStats(doc);
    const highlights = scrapeHighlights(doc);
    const skills = scrapeSkills(doc);
    const description = scrapeFullDescription(doc);
    const aboutCompany = scrapeAboutCompany(doc);

    const role = labeledDetail(doc, ['Role']);
    const industry = labeledDetail(doc, ['Industry Type', 'Industry']);
    const department = labeledDetail(doc, ['Department']);
    const employmentType = labeledDetail(doc, ['Employment Type']);
    const roleCategory = labeledDetail(doc, ['Role Category']);
    const education =
      labeledDetail(doc, ['Education']) ||
      sectionByHeading(doc, /^education$/i, 500);

    // Avoid capturing "Role Category" as Role when Role row is missing.
    const roleClean =
      role && !/^role category$/i.test(role) && !/technology \/ it -/i.test(role)
        ? role
        : role && !/category/i.test(role)
          ? role
          : undefined;

    return {
      platform: this.platform,
      title: cleanText(title) || title,
      company: cleanCompany(company),
      location: cleanText(location),
      externalJobId,
      url: href,
      companyLogo,
      description,
      experience: cleanText(experience),
      salary: cleanText(salary),
      skills: skills.length ? skills : undefined,
      rating,
      reviews,
      postedAt,
      openings,
      applicants,
      highlights: highlights.length ? highlights : undefined,
      role: roleClean || (role && !/category/i.test(role) ? role : undefined),
      industry,
      department,
      employmentType,
      roleCategory,
      education,
      aboutCompany,
      status: 'detected',
    };
  }

  readSearchResults(doc: Document = document): SearchResultJob[] {
    const cards = Array.from(
      doc.querySelectorAll(
        '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id], .tuple-title-wrapper, a.title'
      )
    );

    const seen = new Set<string>();
    const results: SearchResultJob[] = [];

    for (const card of cards) {
      const root =
        card.closest(
          '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id], [class*="jobTuple"]'
        ) ?? card;

      const titleEl =
        (root.querySelector('a.title') as HTMLAnchorElement | null) ??
        (card.tagName === 'A' ? (card as HTMLAnchorElement) : null);
      const title = cleanText(titleEl?.textContent);
      const href = titleEl?.href;
      if (!title || !href || !href.includes('job-listings')) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      const company =
        cleanCompany(
          root.querySelector('a.comp-name, .comp-name, [class*="comp-name"]')
            ?.textContent
        ) || 'Unknown';
      const location =
        cleanText(
          root
            .querySelector('.locWdth, .location, [class*="location"]')
            ?.textContent
        ) || undefined;
      const experienceText =
        cleanText(
          root
            .querySelector('.expwdth, .experience, [class*="experience"]')
            ?.textContent
        ) || undefined;
      const salaryText =
        cleanText(
          root.querySelector('.sal, .salary, [class*="salary"]')?.textContent
        ) || undefined;
      const description =
        cleanText(root.querySelector('.job-desc, [class*="job-desc"]')?.textContent)?.slice(
          0,
          600
        ) || undefined;
      const logoEl = root.querySelector(
        'img.logoImage, img[alt="companyLogo"], .imagewrap img'
      ) as HTMLImageElement | null;
      const companyLogo = absoluteUrl(logoEl?.src);
      const rating =
        cleanText(root.querySelector('.rating .main-2')?.textContent) ||
        undefined;
      const reviews =
        cleanText(
          root
            .querySelector('[class*="review"], a[href*="reviews"]')
            ?.textContent
        ) || undefined;
      const postedAt =
        cleanText(
          root.querySelector(
            '.job-post-day, [class*="job-post-day"], [class*="posted"]'
          )?.textContent
        ) || undefined;
      const skills = Array.from(root.querySelectorAll('.tag-li, .tag, [class*="skill"] span'))
        .map((el) => cleanText(el.textContent))
        .filter((s): s is string => Boolean(s))
        .slice(0, 12);

      // Skip employer-site / external apply jobs during scan.
      if (detectCompanySiteApply(root)) {
        continue;
      }

      results.push({
        title,
        company,
        location,
        url: href.split('?')[0]!,
        externalJobId:
          root.getAttribute('data-job-id') ?? jobIdFromUrl(href),
        experienceText,
        salaryText,
        companyLogo,
        description,
        skills: skills.length ? skills : undefined,
        rating,
        reviews,
        postedAt,
        companySiteApply: false,
      });
    }

    return results;
  }

  /** Job detail page only offers apply on the company website. */
  isCompanySiteApply(doc: Document = document): boolean {
    return detectCompanySiteApply(doc);
  }

  detectApplicationStatus(
    doc: Document = document
  ): JobPayload['status'] | null {
    const href = doc.location?.href ?? '';
    if (
      /\/myapply\/saveApply/i.test(href) ||
      /\/myapply\//i.test(href) ||
      /appliedSuccessfully|applySuccess/i.test(href)
    ) {
      return 'applied';
    }

    if (queryFirst(naukriSelectors.applySuccess, doc)) {
      return 'applied';
    }

    const text = (doc.body?.innerText || '').toLowerCase();
    if (
      /you have successfully applied/.test(text) ||
      /successfully applied to/.test(text) ||
      /application (has been )?submitted/.test(text) ||
      /you have already applied/.test(text) ||
      /already applied for this job/.test(text)
    ) {
      return 'applied';
    }

    return null;
  }

  findEasyApplyButton(doc: Document = document): HTMLElement | null {
    if (this.isCompanySiteApply(doc)) return null;

    const buttons = Array.from(
      doc.querySelectorAll('button, a, [role="button"]')
    ) as HTMLElement[];
    for (const btn of buttons) {
      const label = (btn.textContent || '').trim().toLowerCase();
      if (!label) continue;
      if (isCompanySiteApplyLabel(label)) continue;
      if (/company site|external/.test(label)) continue;
      if (
        label === 'apply' ||
        label.includes('easy apply') ||
        (label.includes('apply') && !label.includes('login'))
      ) {
        if (btn.className.toLowerCase().includes('apply') || label.includes('apply')) {
          return btn;
        }
      }
    }
    return queryFirst(naukriSelectors.easyApply, doc) as HTMLElement | null;
  }

  /**
   * Naukri often opens a chat/Q&A drawer or shows incomplete-info banners
   * that require the user to answer before apply can succeed.
   */
  detectNeedsUserQuestions(doc: Document = document): string | null {
    // Never treat a completed apply page as "still needs questions".
    if (this.detectApplicationStatus(doc) === 'applied') {
      return null;
    }

    const text = (doc.body?.innerText || '').toLowerCase();

    if (
      /incomplete information/.test(text) ||
      /answer all mandatory questions/.test(text) ||
      /mandatory questions when reapplying/.test(text) ||
      /please answer all mandatory/.test(text) ||
      /application was not accepted/.test(text)
    ) {
      return 'Naukri needs mandatory questions answered';
    }

    const questionUi = doc.querySelector(
      [
        '[class*="questionnaire"]',
        '[class*="screening"]',
        '[class*="chatbot"]',
        '[class*="botContainer"]',
        '[class*="apply-form"]',
        '[class*="applyForm"]',
        '[class*="sa-container"]',
        'iframe[src*="chat"]',
        '[data-testid*="question"]',
      ].join(', ')
    );
    if (questionUi) {
      const visible =
        (questionUi as HTMLElement).offsetParent !== null ||
        (questionUi as HTMLElement).getClientRects().length > 0;
      if (visible) {
        return 'Naukri opened an apply questionnaire';
      }
    }

    // Common Q&A drawer: many radios/text inputs near an Apply / Submit footer
    const drawers = Array.from(
      doc.querySelectorAll(
        '[class*="drawer"], [class*="modal"], [role="dialog"], [class*="sidebar"]'
      )
    ) as HTMLElement[];
    for (const drawer of drawers) {
      if (drawer.offsetParent === null) continue;
      const inputs = drawer.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], input[type="text"], textarea, select'
      );
      const asks =
        /question|experience|notice period|current ctc|expected ctc|are you/i.test(
          drawer.innerText || ''
        );
      if (inputs.length >= 2 && asks) {
        return 'Naukri is asking apply questions — please answer them';
      }
    }

    return null;
  }

  hasBlockingApplyFlow(doc: Document = document): string | null {
    const text = (doc.body?.innerText || '').toLowerCase();
    if (text.includes('login to apply') || text.includes('register to apply')) {
      return 'Naukri login required';
    }
    return this.detectNeedsUserQuestions(doc);
  }
}

export function matchesPreferences(
  job: SearchResultJob,
  prefs: JobPreferences
): boolean {
  if (prefs.experienceMin > 0 || prefs.experienceMax < 50) {
    const exp = job.experienceText ?? '';
    const nums = [...exp.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) =>
      Number(m[1])
    );
    if (nums.length >= 1) {
      const low = nums[0]!;
      const high = nums[1] ?? low;
      if (high < prefs.experienceMin || low > prefs.experienceMax) {
        return false;
      }
    }
  }

  if (prefs.minSalaryLpa != null && job.salaryText) {
    const sal = job.salaryText.toLowerCase();
    if (!/not disclosed|unpaid/.test(sal)) {
      const nums = [...sal.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) =>
        Number(m[1])
      );
      const maxShown = nums.length ? Math.max(...nums) : null;
      if (maxShown != null && maxShown < prefs.minSalaryLpa) {
        return false;
      }
    }
  }

  if (prefs.workMode !== 'any' && job.location) {
    const loc = job.location.toLowerCase();
    if (prefs.workMode === 'remote' && !/remote|wfh|work from home/.test(loc)) {
      // soft filter — keep if location list is empty
      if (prefs.locations.length === 0) return true;
    }
  }

  return true;
}
