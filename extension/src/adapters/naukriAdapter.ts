import type { JobPayload, JobPreferences } from '@cosmo/shared';
import { sanitizeJobMetaFields, stripEmbeddedLabels } from '@cosmo/shared';
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
  // Visible Login/Register controls only — never #login_Layer alone
  // (Naukri often keeps that node in the DOM, hidden, after login).
  loggedOut: [
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

/** Positive signals → loggedIn; visible Login/Register → loggedOut; else uncertain. */
export type LoginStatus = 'loggedIn' | 'loggedOut' | 'uncertain';

/** Soft session cookie names — hint only; never sufficient alone for loggedIn. */
const SESSION_COOKIE_NAME_HINTS = [
  /^_t_ds$/i,
  /^naukri/i,
  /^ak_bmsc$/i,
  /^BM_/i,
  /session/i,
  /^_clsk$/i,
  /^UNID$/i,
];

/**
 * Soft probe: presence of Naukri-ish session cookies. Does not prove login;
 * used only as corroborating context alongside DOM status.
 */
export function hasNaukriSessionCookieHint(
  cookieString: string = typeof document !== 'undefined' ? document.cookie : ''
): boolean {
  if (!cookieString.trim()) return false;
  return cookieString.split(';').some((part) => {
    const name = part.split('=')[0]?.trim() ?? '';
    return name.length > 0 && SESSION_COOKIE_NAME_HINTS.some((re) => re.test(name));
  });
}

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

/**
 * Ternary login detection. Prefers positive account signals only.
 * Does not treat #login_Layer presence as logged out.
 */
function resolveLoginStatus(doc: Document): LoginStatus {
  if (hasLoggedInSignal(doc)) return 'loggedIn';
  if (hasVisibleLoggedOutSignal(doc)) return 'loggedOut';
  return 'uncertain';
}

export function getLoginStatus(doc: Document = document): LoginStatus {
  return resolveLoginStatus(doc);
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
      const after = stripEmbeddedLabels(
        cleanText(node.textContent)?.split(':').slice(1).join(':')
      );
      if (after && after.length > 1) return after;
    }

    const sibling =
      (node.nextElementSibling as HTMLElement | null) ??
      (node.parentElement?.querySelector(
        'span, a, [class*="value"], dd'
      ) as HTMLElement | null);
    const siblingText = stripEmbeddedLabels(cleanText(sibling?.textContent));
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
    const value = stripEmbeddedLabels(cleanText(match?.[1]));
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
    '.rating .main-2, [class*="amb-rating"] .main-2, [class*="rating"] .main-2'
  );
  let rating = cleanText(ratingNode?.textContent)?.match(/(\d+(?:\.\d+)?)/)?.[1];

  const headerComp = doc.querySelector(
    '[class*="jd-header-comp-name"], .jd-header-comp-name, a[href*="ambitionbox"]'
  );
  const headerText = cleanText(headerComp?.textContent) || '';
  const reviewsMatch = headerText.match(/([\d,.]+[kKmM]?\+?)\s*Reviews?/i);
  let reviews = reviewsMatch
    ? `${reviewsMatch[1]} Reviews`
    : cleanText(
        doc.querySelector(
          'a[href*="ambitionbox"][href*="reviews"], [class*="reviews-count"], [class*="review-count"]'
        )?.textContent
      );

  if (!rating) {
    rating = headerText.match(/^(\d+(?:\.\d+)?)/)?.[1];
  }

  // Avoid "3.9 · 3.9" when reviews accidentally captured the same rating digit.
  const reviewsNum = cleanText(reviews)?.match(/^(\d+(?:\.\d+)?)$/)?.[1];
  if (rating && reviewsNum && reviewsNum === rating) {
    reviews = undefined;
  }
  if (rating && reviews && reviews.replace(/\s+/g, '') === rating) {
    reviews = undefined;
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
      '[class*="key-skill"] a, [class*="key-skill"] span, [class*="chip"] span, .chip, [class*="skills"] a, [class*="tag-li"], [class*="styles_chip"] span, [class*="styles_key-skill"] span'
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

  return uniqueStrings(filtered, 60);
}

/** Expand truncated JD sections so we capture the full posting. */
export function expandJobDetailSections(doc: Document = document): void {
  const buttons = Array.from(
    doc.querySelectorAll('button, a, span, div[role="button"]')
  );
  for (const el of buttons) {
    const text = cleanText(el.textContent) || '';
    if (
      !/^(read more|view more|see more|show more|\+?\s*\d+\s*more)$/i.test(text) &&
      !/read more|view more|see more/i.test(text)
    ) {
      continue;
    }
    if (text.length > 40) continue;

    // Never follow external / new-tab links while expanding JD text.
    if (el instanceof HTMLAnchorElement) {
      const href = el.getAttribute('href') || '';
      if (
        el.target === '_blank' ||
        (/^https?:/i.test(href) && !/naukri\.com/i.test(href))
      ) {
        continue;
      }
    }

    try {
      clickInSameTab(el as HTMLElement);
    } catch {
      /* ignore */
    }
  }
}

/** Click without allowing target=_blank / window.open to spawn tabs. */
export function clickInSameTab(el: HTMLElement): void {
  if (el instanceof HTMLAnchorElement || el.tagName.toLowerCase() === 'a') {
    el.setAttribute('target', '_self');
  }

  const win = el.ownerDocument?.defaultView ?? window;
  const previousOpen = win.open.bind(win);
  win.open = ((url?: string | URL | undefined) => {
    if (url != null && String(url) && String(url) !== 'about:blank') {
      win.location.assign(String(url));
    }
    return win;
  }) as typeof win.open;

  try {
    el.click();
  } finally {
    win.open = previousOpen;
  }
}

function scrapeFullDescription(doc: Document): string | undefined {
  expandJobDetailSections(doc);

  const sections = [
    sectionByHeading(doc, /^role\s*&\s*responsibilities$/i, 8000),
    sectionByHeading(doc, /^preferred candidate profile$/i, 6000),
    sectionByHeading(doc, /^job description$/i, 10000),
    sectionByHeading(doc, /^what you('ll| will) (do|bring)$/i, 6000),
    sectionByHeading(doc, /^requirements?$/i, 6000),
  ].filter(Boolean) as string[];

  if (sections.length) {
    return uniqueStrings(sections, 8).join('\n\n').slice(0, 12000);
  }

  const selectors = [
    '[class*="job-desc"]',
    '[class*="styles_job-desc"]',
    '#job-description',
    '[class*="jd-description"]',
    '.dang-inner-html',
    '[class*="description"]',
  ];
  let best: string | undefined;
  for (const selector of selectors) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      const text = cleanText(el.textContent);
      if (text && text.length > 80 && (!best || text.length > best.length)) {
        best = text;
      }
    }
  }
  if (best) return best.slice(0, 12000);

  const body = doc.body?.innerText || '';
  const block = body.match(
    /Job description\s*([\s\S]{80,12000}?)(?=\n(?:About (?:the )?company|Education|Role|Industry Type|Department|Employment Type|Keyskills|Report this job)\b|$)/i
  )?.[1];
  return cleanText(block)?.slice(0, 12000);
}

function scrapeAboutCompany(doc: Document): string | undefined {
  expandJobDetailSections(doc);
  return (
    sectionByHeading(doc, /^about (the )?company$/i, 4000) ||
    cleanText(
      doc.querySelector(
        '[class*="about-company"], [class*="comp-detail"], [class*="company-info"]'
      )?.textContent
    )?.slice(0, 4000)
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

/** Naukri search box keyword from job preferences (primary title, not all chips mashed). */
export function buildSearchKeyword(prefs: JobPreferences): string {
  const title = prefs.titles.map((t) => t.trim()).find(Boolean);
  if (title) return title;

  const keyword = prefs.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  return keyword || 'software developer';
}

/** Naukri ctcFilter buckets (LPA) + sidebar label text. */
const NAUKRI_CTC_BUCKETS: Array<{
  id: string;
  min: number;
  max: number;
  label: string;
}> = [
  { id: '0to3', min: 0, max: 3, label: '0-3 Lakhs' },
  { id: '3to6', min: 3, max: 6, label: '3-6 Lakhs' },
  { id: '6to10', min: 6, max: 10, label: '6-10 Lakhs' },
  { id: '10to15', min: 10, max: 15, label: '10-15 Lakhs' },
  { id: '15to25', min: 15, max: 25, label: '15-25 Lakhs' },
  { id: '25to50', min: 25, max: 50, label: '25-50 Lakhs' },
  { id: '50to75', min: 50, max: 75, label: '50-75 Lakhs' },
  { id: '75to100', min: 75, max: 100, label: '75-100 Lakhs' },
  { id: '100to500', min: 100, max: 500, label: '100+ Lakhs' },
];

/** Buckets that can satisfy the user's minimum LPA (strict; no lower-only bands). */
export function ctcFiltersForMinSalary(minSalaryLpa: number): string[] {
  if (!(minSalaryLpa > 0)) return [];
  return NAUKRI_CTC_BUCKETS.filter(
    (b) => b.min >= minSalaryLpa || (b.min < minSalaryLpa && b.max > minSalaryLpa)
  ).map((b) => b.id);
}

/** Sidebar Salary checkbox labels for min LPA (e.g. "10-15 Lakhs"). */
export function salaryBucketLabelsForMin(
  minSalaryLpa: number | null | undefined
): string[] {
  if (minSalaryLpa == null || !(minSalaryLpa > 0)) return [];
  return NAUKRI_CTC_BUCKETS.filter(
    (b) => b.min >= minSalaryLpa || (b.min < minSalaryLpa && b.max > minSalaryLpa)
  ).map((b) => b.label);
}

/** Alternate Naukri spellings for a salary bucket label. */
export function salaryLabelVariants(label: string): string[] {
  const base = label.replace(/lakhs?/i, '').trim();
  const nums = base.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?|\+)/i);
  const variants = new Set<string>([label]);
  variants.add(label.replace(/Lakhs?/i, 'Lacs'));
  variants.add(label.replace(/Lakhs?/i, 'Lac'));
  variants.add(label.replace(/Lakhs?/i, 'Lakh'));
  if (nums) {
    const a = nums[1]!;
    const b = nums[2]!;
    for (const unit of ['Lakhs', 'Lacs', 'Lakh', 'Lac']) {
      variants.add(`${a}-${b} ${unit}`);
      variants.add(`${a} - ${b} ${unit}`);
      variants.add(`${a} to ${b} ${unit}`);
    }
  }
  return [...variants];
}

/** Naukri wfhType URL value for Cosmo workMode (`office` | `remote` | `hybrid`). */
export function wfhTypeForWorkMode(
  workMode: JobPreferences['workMode']
): string | null {
  if (workMode === 'office') return '0';
  if (workMode === 'remote') return '2';
  if (workMode === 'hybrid') return '3';
  return null;
}

/** Sidebar Work mode labels (Naukri uses several wordings). */
export function workModeFilterLabel(
  workMode: JobPreferences['workMode']
): string | null {
  if (workMode === 'office') return 'Work from office';
  if (workMode === 'remote') return 'Remote';
  if (workMode === 'hybrid') return 'Hybrid';
  return null;
}

export function workModeFilterLabels(
  workMode: JobPreferences['workMode']
): string[] {
  if (workMode === 'office') return ['Work from office', 'Office', 'In Office'];
  if (workMode === 'remote') {
    return ['Remote', 'Work from home', 'WFH', 'Work from Home'];
  }
  if (workMode === 'hybrid') return ['Hybrid'];
  return [];
}

/**
 * Parse Naukri salary text into an LPA range.
 * Returns null when salary is missing, undisclosed, or unparsable.
 */
export function parseSalaryLpaRange(
  salaryText: string | null | undefined
): { min: number; max: number } | null {
  if (!salaryText?.trim()) return null;
  const sal = salaryText.toLowerCase().trim();
  if (/not\s*disclosed|undisclosed|unpaid|hidden|n\/a/.test(sal)) return null;

  // Prefer "3-6 LPA" / "10 – 15 Lacs" / "10 to 15"
  const rangeLpa = sal.match(
    /(\d+(?:\.\d+)?)\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?)/i
  );
  if (rangeLpa) {
    const low = Number(rangeLpa[1]);
    const high = Number(rangeLpa[2]);
    if (Number.isFinite(low) && Number.isFinite(high) && high >= low && high <= 500) {
      return { min: low, max: high };
    }
  }

  const singleLpa = sal.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lacs?|lakhs?)\b/i);
  if (singleLpa) {
    const n = Number(singleLpa[1]);
    if (Number.isFinite(n) && n > 0 && n <= 500) return { min: n, max: n };
  }

  // Absolute INR amounts → LPA (e.g. 12,00,000 - 18,00,000)
  const inr = sal.replace(/,/g, '');
  const amounts = [...inr.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 100_000);
  if (amounts.length) {
    const lpas = amounts.map((a) => a / 100_000);
    return { min: Math.min(...lpas), max: Math.max(...lpas) };
  }

  const nums = [...sal.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 500);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Strict salary gate: disclosed LPA must be able to meet the minimum. */
export function salaryMeetsMinimum(
  salaryText: string | null | undefined,
  minSalaryLpa: number | null | undefined
): boolean {
  if (minSalaryLpa == null || !(minSalaryLpa > 0)) return true;
  const range = parseSalaryLpaRange(salaryText);
  if (!range) return false;
  return range.max >= minSalaryLpa;
}

export function buildNaukriSearchUrl(prefs: JobPreferences): string {
  const keyword = buildSearchKeyword(prefs);
  const location = prefs.locations[0] ?? '';
  const params = new URLSearchParams();
  params.set('k', keyword);
  if (location) params.set('l', location);
  if (prefs.experienceMin > 0 || prefs.experienceMax < 30) {
    params.set('experience', String(prefs.experienceMin));
  }
  if (prefs.minSalaryLpa != null && prefs.minSalaryLpa > 0) {
    for (const bucket of ctcFiltersForMinSalary(prefs.minSalaryLpa)) {
      params.append('ctcFilter', bucket);
    }
  }
  const wfh = wfhTypeForWorkMode(prefs.workMode);
  if (wfh != null) {
    params.set('wfhType', wfh);
  }
  const slug = keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://www.naukri.com/${slug}-jobs?${params.toString()}`;
}

function ownText(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    }
  }
  return cleanText(text) || '';
}

function normalizeFilterLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(\d+\)/g, '')
    .replace(/lakhs?/g, 'lakhs')
    .replace(/lacs?/g, 'lakhs')
    .replace(/[^a-z0-9+.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelMatchesFilter(optionText: string, wanted: string): boolean {
  const a = normalizeFilterLabel(optionText);
  const b = normalizeFilterLabel(wanted);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const compact = (s: string) => s.replace(/\s+/g, '').replace(/to/g, '-');
  return compact(a).includes(compact(b)) || compact(b).includes(compact(a));
}

/**
 * Naukri wraps each filter as:
 *   .styles_chckBoxCont > input[display:none]#chk-{label}-{filterId}- + label > i.ni-icon-*
 * Prefer the checkbox container — never the filterLabel span alone.
 */
function filterRowOf(el: HTMLElement): HTMLElement {
  return (
    (el.closest(
      '[class*="chckBoxCont"], [class*="chkBox"], label[for], [role="checkbox"]'
    ) as HTMLElement | null) ||
    (el.closest('label, li') as HTMLElement | null) ||
    el
  );
}

function filterCheckboxInput(row: HTMLElement): HTMLInputElement | null {
  if (row instanceof HTMLInputElement && row.type === 'checkbox') return row;
  return row.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
}

function isFilterOptionChecked(el: HTMLElement): boolean {
  const row = filterRowOf(el);
  const input = filterCheckboxInput(row) || filterCheckboxInput(el);
  if (input) return input.checked;
  const aria = el.getAttribute('aria-checked') || row.getAttribute('aria-checked');
  if (aria === 'true') return true;
  if (aria === 'false') return false;
  if (row.querySelector('i.ni-icon-checked, [class*="ni-icon-checked"]')) {
    return true;
  }
  const cls = `${row.className} ${el.className}`.toLowerCase();
  if (/\b(checked|selected|active)\b/.test(cls)) return true;
  return false;
}

function filtersSidebarVisible(doc: Document): boolean {
  if (
    doc.querySelector(
      'input[id*="ctcFilter"], input[id*="wfhType"], [data-filter-id="salaryRange"], [data-filter-id="wfhType"]'
    )
  ) {
    return true;
  }
  const text = doc.body?.innerText || '';
  return (
    (/all filters/i.test(text) || /\bfilters\b/i.test(text)) &&
    /salary/i.test(text) &&
    /lakhs?/i.test(text)
  );
}

/** Full pointer/mouse sequence — Naukri ignores bare HTMLElement.click() on hidden inputs. */
function dispatchPointerClick(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const view = doc.defaultView ?? window;
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + Math.min(Math.max(rect.width / 2, 4), 24);
  const clientY = rect.top + Math.min(Math.max(rect.height / 2, 4), 24);
  const common = {
    bubbles: true,
    cancelable: true,
    view,
    clientX,
    clientY,
    button: 0,
    buttons: 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  } as const;

  const PointerCtor =
    typeof PointerEvent !== 'undefined'
      ? PointerEvent
      : typeof (view as Window & { PointerEvent?: typeof PointerEvent }).PointerEvent !==
          'undefined'
        ? (view as Window & { PointerEvent: typeof PointerEvent }).PointerEvent
        : null;

  for (const type of [
    'pointerover',
    'pointerenter',
    'mouseover',
    'mouseenter',
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ] as const) {
    if (type.startsWith('pointer')) {
      if (PointerCtor) {
        el.dispatchEvent(new PointerCtor(type, common));
      }
      continue;
    }
    el.dispatchEvent(new MouseEvent(type, common));
  }

  try {
    el.click();
  } catch {
    /* ignore */
  }
}

/**
 * Click Naukri "All Filters" so salary / work-mode checkboxes are available.
 * Returns true when the filter panel looks ready.
 */
export function openAllFiltersPanel(doc: Document): boolean {
  if (filtersSidebarVisible(doc)) return true;

  const triggers = Array.from(
    doc.querySelectorAll(
      'button, a, span, div[role="button"], [class*="filter"], [class*="Filter"]'
    )
  ) as HTMLElement[];

  const ranked = triggers
    .map((el) => {
      const text =
        ownText(el) ||
        cleanText(el.getAttribute('aria-label')) ||
        cleanText(el.textContent)?.slice(0, 48) ||
        '';
      return { el, text };
    })
    .filter(({ text }) => text.length > 0 && text.length < 48);

  const preferred =
    ranked.find(({ text }) => /^all\s*filters?\b/i.test(text)) ||
    ranked.find(({ text }) => /\ball\s*filters?\b/i.test(text)) ||
    ranked.find(({ text }) => /^filters?$/i.test(text));

  if (preferred) {
    try {
      dispatchPointerClick(preferred.el);
      clickInSameTab(preferred.el);
    } catch {
      /* ignore */
    }
  }

  return filtersSidebarVisible(doc);
}

function findFilterSection(
  doc: Document,
  headingRe: RegExp,
  dataFilterId?: string
): HTMLElement | null {
  if (dataFilterId) {
    const byId = doc.querySelector(
      `[data-filter-id="${dataFilterId}"]`
    ) as HTMLElement | null;
    if (byId) {
      return (
        (byId.closest(
          '[class*="filterContainer"], [class*="filter-wrapper"], [class*="Filter"]'
        ) as HTMLElement | null) || byId
      );
    }
  }

  const candidates = Array.from(
    doc.querySelectorAll(
      '[class*="filterHeading"] span, [class*="filterHeading"], h2, h3, h4, h5, span, div, p'
    )
  ) as HTMLElement[];
  for (const el of candidates) {
    const text = ownText(el) || cleanText(el.textContent) || '';
    if (!text || text.length > 32) continue;
    if (!headingRe.test(text)) continue;
    const section =
      (el.closest(
        '[class*="filterContainer"], [class*="filter-wrapper"], [class*="filter"], [class*="Filter"], section, fieldset'
      ) as HTMLElement | null) || el.parentElement;
    if (section) return section as HTMLElement;
  }
  return null;
}

function expandViewMoreInSection(section: HTMLElement): void {
  const links = Array.from(
    section.querySelectorAll('a, button, span, div[role="button"]')
  ) as HTMLElement[];
  for (const el of links) {
    const text = ownText(el) || cleanText(el.textContent) || '';
    if (/^view more$/i.test(text) || /^show more$/i.test(text)) {
      try {
        dispatchPointerClick(el);
        clickInSameTab(el);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Find Naukri filter row by label. Prefer real chk-* inputs (ctcFilter / wfhType).
 */
function findFilterOption(
  root: ParentNode,
  wantedLabel: string,
  filterKind?: 'ctcFilter' | 'wfhType'
): HTMLElement | null {
  const scope = root as Document | Element;
  const variants = salaryLabelVariants(wantedLabel);
  if (!variants.includes(wantedLabel)) variants.unshift(wantedLabel);

  const inputSelectors = filterKind
    ? [
        `input[type="checkbox"][id*="${filterKind}"]`,
        'input[type="checkbox"][id^="chk-"]',
        'input[type="checkbox"]',
      ]
    : ['input[type="checkbox"][id^="chk-"]', 'input[type="checkbox"]'];

  const seen = new Set<HTMLInputElement>();
  for (const selector of inputSelectors) {
    const inputs = Array.from(
      scope.querySelectorAll?.(selector) ?? []
    ) as HTMLInputElement[];
    for (const input of inputs) {
      if (seen.has(input)) continue;
      seen.add(input);
      const id = input.id || '';
      // When a kind is requested, skip other filter families if id encodes one.
      if (
        filterKind &&
        /-(ctcFilter|wfhType|functionAreaIdGid|cityTypeGid)-/.test(id) &&
        !id.includes(filterKind)
      ) {
        continue;
      }
      const title =
        input
          .closest('[class*="chckBoxCont"], [class*="chkBox"]')
          ?.querySelector('[title]')
          ?.getAttribute('title') || '';
      const labelText =
        title ||
        cleanText(
          input
            .closest('[class*="chckBoxCont"], [class*="chkBox"], label')
            ?.textContent || ''
        ) ||
        '';
      const idLabel = id
        .replace(/^chk-/, '')
        .replace(
          /-(ctcFilter|wfhType|functionAreaIdGid|cityTypeGid|qbusinessSize|glbl_qcrc)-$/,
          ''
        );
      for (const wanted of variants) {
        if (
          labelMatchesFilter(labelText, wanted) ||
          labelMatchesFilter(idLabel, wanted) ||
          labelMatchesFilter(id, wanted)
        ) {
          return filterRowOf(input);
        }
      }
    }
  }

  // Fallback: title spans inside filter options only (avoid "Remote jobs" page copy).
  const nodes = Array.from(
    scope.querySelectorAll?.(
      '[data-filter-id] [title], [class*="filterOptns"] [title], [class*="filterLabel"][title], label[for^="chk-"]'
    ) ?? []
  ) as HTMLElement[];

  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of nodes) {
    const text =
      cleanText(el.getAttribute('title')) ||
      cleanText(el.textContent) ||
      '';
    if (!text || text.length > 72) continue;
    if (!variants.some((v) => labelMatchesFilter(text, v))) continue;
    if (text.length < bestLen) {
      best = el;
      bestLen = text.length;
    }
  }
  if (!best) return null;
  return filterRowOf(best);
}

function clickFilterOption(opt: HTMLElement): void {
  const row = filterRowOf(opt);
  const input = filterCheckboxInput(row);
  const label =
    (input?.id
      ? (Array.from(row.querySelectorAll('label')).find(
          (l) => (l as HTMLLabelElement).htmlFor === input.id
        ) as HTMLLabelElement | undefined)
      : undefined) ||
    (row.querySelector('label') as HTMLLabelElement | null) ||
    (row.tagName === 'LABEL' ? (row as HTMLLabelElement) : null);
  const icon = row.querySelector(
    'i.ni-icon-unchecked, i.ni-icon-checked, i[class*="ni-icon"], i, [class*="chk"]'
  ) as HTMLElement | null;

  // Naukri: input is display:none — pointer sequence on label/icon/container.
  const targets = [icon, label, row, input].filter(Boolean) as HTMLElement[];
  for (const target of targets) {
    try {
      dispatchPointerClick(target);
      if (input && isFilterOptionChecked(row)) return;
    } catch {
      /* try next */
    }
  }

  // React controlled checkbox fallback.
  if (input && !input.checked) {
    try {
      const propsKey = Object.keys(input).find((k) =>
        k.startsWith('__reactProps')
      );
      const props = propsKey
        ? ((input as unknown as Record<string, { onChange?: (e: unknown) => void }>)[
            propsKey
          ] as { onChange?: (e: unknown) => void } | undefined)
        : undefined;
      if (typeof props?.onChange === 'function') {
        props.onChange({
          target: { checked: true },
          currentTarget: { checked: true },
        });
        if (isFilterOptionChecked(row)) return;
      }
    } catch {
      /* ignore */
    }
    try {
      input.click();
    } catch {
      /* ignore */
    }
  }

  if (!input) clickInSameTab(row);
}

export type ApplyFiltersResult = {
  ok: boolean;
  applied: string[];
  skipped: string[];
  ready: boolean;
  openedAllFilters?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 1) Click Naukri "All Filters"
 * 2) Tick salary + work mode from Cosmo prefs
 * (No humanPace apply delay — only short DOM settle waits.)
 */
export async function applyPreferenceFiltersAsync(
  doc: Document,
  prefs: JobPreferences,
  settleMs = 500
): Promise<ApplyFiltersResult> {
  const applied: string[] = [];
  const skipped: string[] = [];

  const salaryLabels = salaryBucketLabelsForMin(prefs.minSalaryLpa);
  const workLabels = workModeFilterLabels(prefs.workMode);
  const workLabel = workLabels[0] ?? workModeFilterLabel(prefs.workMode);

  // Always open All Filters first, then tick preference checkboxes.
  let openedAllFilters = openAllFiltersPanel(doc);
  await sleep(700);
  if (!openedAllFilters) {
    openedAllFilters = openAllFiltersPanel(doc);
    await sleep(800);
  }
  openedAllFilters = openedAllFilters || filtersSidebarVisible(doc);

  if (!salaryLabels.length && !workLabels.length) {
    return {
      ok: openedAllFilters,
      applied,
      skipped: openedAllFilters
        ? ['No salary/work-mode prefs to tick']
        : ['All Filters panel not found'],
      ready: openedAllFilters,
      openedAllFilters,
    };
  }

  const salarySection =
    findFilterSection(doc, /^salary$/i, 'salaryRange') ||
    findFilterSection(doc, /^all filters$/i);
  const workSection = findFilterSection(doc, /^work\s*mode$/i, 'wfhType');
  const searchRoot = salarySection || workSection || doc.body;

  const probeSalary =
    findFilterOption(searchRoot, '10-15 Lakhs', 'ctcFilter') ||
    findFilterOption(searchRoot, '0-3 Lakhs', 'ctcFilter') ||
    findFilterOption(doc.body, '10-15 Lakhs', 'ctcFilter') ||
    doc.querySelector('input[id*="ctcFilter"]');
  const probeWork =
    findFilterOption(searchRoot, 'Remote', 'wfhType') ||
    findFilterOption(searchRoot, 'Hybrid', 'wfhType') ||
    findFilterOption(searchRoot, 'Work from office', 'wfhType') ||
    doc.querySelector('input[id*="wfhType"]');

  if (
    (salaryLabels.length && !probeSalary) ||
    (workLabels.length && !probeWork && !probeSalary)
  ) {
    return {
      ok: false,
      applied,
      skipped: [
        openedAllFilters
          ? 'All Filters open but Salary/Work mode options not ready'
          : 'All Filters panel not ready',
      ],
      ready: false,
      openedAllFilters,
    };
  }

  const salaryRoot = salarySection || doc.body;
  const workRoot = workSection || doc.body;

  if (salaryLabels.length) {
    expandViewMoreInSection(salaryRoot);
    await sleep(350);
    // Higher bands sit behind "View more" — expand again after first pass.
    expandViewMoreInSection(salaryRoot);
    await sleep(200);
    // Click salary bands that meet min (cap to avoid endless clicks).
    for (const label of salaryLabels.slice(0, 5)) {
      let opt =
        findFilterOption(salaryRoot, label, 'ctcFilter') ||
        findFilterOption(doc.body, label, 'ctcFilter');
      if (!opt) {
        expandViewMoreInSection(salaryRoot);
        await sleep(250);
        opt =
          findFilterOption(salaryRoot, label, 'ctcFilter') ||
          findFilterOption(doc.body, label, 'ctcFilter');
      }
      if (!opt) {
        skipped.push(`Salary: ${label} (not found)`);
        continue;
      }
      if (isFilterOptionChecked(opt)) {
        skipped.push(`Salary: ${label} (already on)`);
        continue;
      }
      try {
        clickFilterOption(opt);
        if (!isFilterOptionChecked(opt)) {
          clickFilterOption(opt);
        }
        if (isFilterOptionChecked(opt)) {
          applied.push(`Salary: ${label}`);
        } else {
          skipped.push(`Salary: ${label} (click did not stick)`);
        }
        await sleep(settleMs);
      } catch {
        skipped.push(`Salary: ${label} (click failed)`);
      }
    }
  }

  if (workLabels.length) {
    expandViewMoreInSection(workRoot);
    await sleep(300);
    let opt: HTMLElement | null = null;
    for (const candidate of workLabels) {
      opt =
        findFilterOption(workRoot, candidate, 'wfhType') ||
        findFilterOption(doc.body, candidate, 'wfhType');
      if (opt) {
        break;
      }
    }
    if (!opt) {
      skipped.push(`Work mode: ${workLabel} (not found)`);
    } else if (isFilterOptionChecked(opt)) {
      skipped.push(`Work mode: ${workLabel} (already on)`);
    } else {
      try {
        clickFilterOption(opt);
        if (!isFilterOptionChecked(opt)) clickFilterOption(opt);
        if (isFilterOptionChecked(opt)) {
          applied.push(`Work mode: ${workLabel}`);
        } else {
          skipped.push(`Work mode: ${workLabel} (click did not stick)`);
        }
        await sleep(settleMs);
      } catch {
        skipped.push(`Work mode: ${workLabel} (click failed)`);
      }
    }
  }

  return {
    ok:
      applied.length > 0 ||
      skipped.some((s) => /already on/.test(s)) ||
      (!salaryLabels.length && !workLabel),
    applied,
    skipped,
    ready: true,
    openedAllFilters,
  };
}

/** Sync wrapper for tests / simple calls. */
export function applyPreferenceFilters(
  doc: Document,
  prefs: JobPreferences
): ApplyFiltersResult {
  // Fire clicks synchronously (tests); production uses applyPreferenceFiltersAsync.
  const applied: string[] = [];
  const skipped: string[] = [];
  const salaryLabels = salaryBucketLabelsForMin(prefs.minSalaryLpa);
  const workLabels = workModeFilterLabels(prefs.workMode);
  const workLabel = workLabels[0] ?? workModeFilterLabel(prefs.workMode);
  const openedAllFilters = openAllFiltersPanel(doc);
  if (!salaryLabels.length && !workLabels.length) {
    return { ok: true, applied, skipped, ready: true, openedAllFilters };
  }
  const salaryRoot =
    findFilterSection(doc, /^salary$/i, 'salaryRange') ||
    findFilterSection(doc, /^all filters$/i) ||
    doc.body;
  const workRoot =
    findFilterSection(doc, /^work\s*mode$/i, 'wfhType') || doc.body;
  const probe =
    findFilterOption(salaryRoot, '10-15 Lakhs', 'ctcFilter') ||
    findFilterOption(doc.body, '0-3 Lakhs', 'ctcFilter') ||
    findFilterOption(doc.body, '10-15 Lakhs') ||
    doc.querySelector('input[id*="ctcFilter"]');
  if (salaryLabels.length && !probe) {
    return {
      ok: false,
      applied,
      skipped: ['Filter sidebar not ready'],
      ready: false,
    };
  }
  expandViewMoreInSection(salaryRoot);
  for (const label of salaryLabels.slice(0, 5)) {
    const opt =
      findFilterOption(salaryRoot, label, 'ctcFilter') ||
      findFilterOption(doc.body, label, 'ctcFilter');
    if (!opt) {
      skipped.push(`Salary: ${label} (not found)`);
      continue;
    }
    if (isFilterOptionChecked(opt)) {
      skipped.push(`Salary: ${label} (already on)`);
      continue;
    }
    clickFilterOption(opt);
    applied.push(`Salary: ${label}`);
  }
  if (workLabels.length) {
    let opt: HTMLElement | null = null;
    for (const candidate of workLabels) {
      opt =
        findFilterOption(workRoot, candidate, 'wfhType') ||
        findFilterOption(doc.body, candidate, 'wfhType');
      if (opt) break;
    }
    if (!opt) skipped.push(`Work mode: ${workLabel} (not found)`);
    else if (isFilterOptionChecked(opt)) {
      skipped.push(`Work mode: ${workLabel} (already on)`);
    } else {
      clickFilterOption(opt);
      applied.push(`Work mode: ${workLabel}`);
    }
  }
  return {
    ok: applied.length > 0 || skipped.some((s) => /already on/.test(s)),
    applied,
    skipped,
    ready: true,
  };
}

/** True when sidebar already has the preference filters selected. */
export function preferenceFiltersAlreadyApplied(
  doc: Document,
  prefs: JobPreferences
): boolean {
  const salaryLabels = salaryBucketLabelsForMin(prefs.minSalaryLpa);
  const workLabels = workModeFilterLabels(prefs.workMode);
  if (!salaryLabels.length && !workLabels.length) return true;

  const salaryRoot =
    findFilterSection(doc, /^salary$/i, 'salaryRange') ||
    findFilterSection(doc, /^all filters$/i) ||
    doc.body;
  const workRoot =
    findFilterSection(doc, /^work\s*mode$/i, 'wfhType') || doc.body;

  let checkedSalary = 0;
  let foundSalary = 0;
  for (const label of salaryLabels.slice(0, 5)) {
    const opt =
      findFilterOption(salaryRoot, label, 'ctcFilter') ||
      findFilterOption(doc.body, label, 'ctcFilter');
    if (!opt) continue;
    foundSalary += 1;
    if (isFilterOptionChecked(opt)) checkedSalary += 1;
  }

  if (salaryLabels.length) {
    if (
      !foundSalary &&
      !doc.querySelector('input[id*="ctcFilter"]') &&
      !findFilterOption(doc.body, '10-15 Lakhs', 'ctcFilter')
    ) {
      return false;
    }
    if (foundSalary > 0 && checkedSalary === 0) return false;
    if (foundSalary === 0) return false;
  }

  if (workLabels.length) {
    let opt: HTMLElement | null = null;
    for (const candidate of workLabels) {
      opt =
        findFilterOption(workRoot, candidate, 'wfhType') ||
        findFilterOption(doc.body, candidate, 'wfhType');
      if (opt) break;
    }
    if (!opt || !isFilterOptionChecked(opt)) return false;
  }
  return true;
}

/** Whether the current page URL already carries Cosmo filter query params. */
export function searchUrlHasPreferenceFilters(
  url: string,
  prefs: JobPreferences
): boolean {
  try {
    const u = new URL(url);
    const needsSalary = prefs.minSalaryLpa != null && prefs.minSalaryLpa > 0;
    const needsWfh = wfhTypeForWorkMode(prefs.workMode) != null;
    if (!needsSalary && !needsWfh) return true;
    if (needsSalary && !u.searchParams.getAll('ctcFilter').length) return false;
    if (needsWfh) {
      const want = wfhTypeForWorkMode(prefs.workMode);
      if (u.searchParams.get('wfhType') !== want) return false;
    }
    return true;
  } catch {
    return false;
  }
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

  getLoginStatus(doc: Document = document): LoginStatus {
    return resolveLoginStatus(doc);
  }

  isLoggedIn(doc: Document = document): boolean {
    return resolveLoginStatus(doc) === 'loggedIn';
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
    let salary =
      firstMatchingText(doc, [
        '.sal',
        '[class*="jhc__salary"]',
        '[class*="salary"] span',
        '[title*="salary" i]',
        '[class*="sal-wrap"]',
      ]) || undefined;
    if (!salary) {
      const headerBlob = cleanText(
        doc.querySelector(
          '[class*="jhc__"], [class*="jd-header"], .jd-header'
        )?.textContent
      );
      const salMatch = headerBlob?.match(
        /(?:₹|Rs\.?\s*)?([\d,.]+\s*[-–to]+\s*[\d,.]+\s*(?:LPA|Lacs?|Lakhs?)|Not\s*Disclosed)/i
      );
      salary = cleanText(salMatch?.[1] || salMatch?.[0]);
    }
    if (!salary) {
      const bodyTop = (doc.body?.innerText || '').slice(0, 2000);
      if (/not\s*disclosed/i.test(bodyTop)) salary = 'Not Disclosed';
    }

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

    const sanitized = sanitizeJobMetaFields({
      experience: cleanText(experience),
      salary: cleanText(salary),
      postedAt,
      openings,
      applicants,
      role: roleClean || (role && !/category/i.test(role) ? role : undefined),
      industry,
      department,
      employmentType,
      roleCategory,
      education,
    });

    return {
      platform: this.platform,
      title: cleanText(title) || title,
      company: cleanCompany(company),
      location: cleanText(location),
      externalJobId,
      url: href,
      companyLogo,
      description,
      experience: sanitized.experience,
      salary: sanitized.salary,
      skills: skills.length ? skills : undefined,
      rating,
      reviews,
      postedAt: sanitized.postedAt,
      openings: sanitized.openings,
      applicants: sanitized.applicants,
      highlights: highlights.length ? highlights : undefined,
      role: sanitized.role,
      industry: sanitized.industry,
      department: sanitized.department,
      employmentType: sanitized.employmentType,
      roleCategory: sanitized.roleCategory,
      education: sanitized.education,
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
          2000
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
      const skills = Array.from(root.querySelectorAll('.tag-li, .tag, [class*="skill"] span, [class*="chip"] span'))
        .map((el) => cleanText(el.textContent))
        .filter((s): s is string => Boolean(s))
        .slice(0, 30);

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

  /** True when Naukri says this job was applied earlier (not a fresh apply). */
  isAlreadyApplied(doc: Document = document): boolean {
    const text = (doc.body?.innerText || '').toLowerCase();
    return (
      /you have already applied/.test(text) ||
      /already applied for this job/.test(text) ||
      /already applied to this/.test(text)
    );
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
      /already applied for this job/.test(text) ||
      /already applied to this/.test(text)
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
    const block = this.detectNaukriBlockPage(doc);
    if (block) return block;
    const text = (doc.body?.innerText || '').toLowerCase();
    if (text.includes('login to apply') || text.includes('register to apply')) {
      return 'Naukri login required';
    }
    return this.detectNeedsUserQuestions(doc);
  }

  detectNaukriBlockPage(doc: Document = document): string | null {
    const title = (doc.title || '').toLowerCase();
    const text = (doc.body?.innerText || '').slice(0, 8000).toLowerCase();

    const blockPatterns = [
      /captcha/,
      /verify you are human/,
      /unusual activity/,
      /access denied/,
      /security check/,
      /challenge-page/,
      /robot check/,
      /temporarily blocked/,
      /suspicious activity/,
    ];
    if (blockPatterns.some((p) => p.test(title) || p.test(text))) {
      return 'Naukri verification or block page detected';
    }

    const challengeSelectors = [
      'iframe[src*="captcha"]',
      'iframe[src*="challenge"]',
      '[class*="captcha"]',
      '[id*="captcha"]',
      '#challenge-form',
      '.cf-browser-verification',
      '[data-testid*="captcha"]',
    ].join(', ');
    const challenge = doc.querySelector(challengeSelectors);
    if (challenge) {
      const el = challenge as HTMLElement;
      if (el.offsetParent !== null || el.getClientRects().length > 0) {
        return 'Naukri verification or block page detected';
      }
    }

    return null;
  }

  clickNextSearchPage(doc: Document = document): {
    ok: boolean;
    reason?: string;
  } {
    const nodes = Array.from(
      doc.querySelectorAll<HTMLElement>(
        [
          '[class*="pagination"] a',
          '[class*="Pagination"] a',
          '[class*="styles_pagination"] a',
          '[class*="styles_pages"] a',
          'a[aria-label*="next" i]',
          'button[aria-label*="next" i]',
          'a, button, [role="button"]',
        ].join(', ')
      )
    );
    const next = nodes.find((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      if (rel === 'next') return true;
      if (/^next$/i.test(text) || /^›$|^>$|^»$/.test(text)) return true;
      if (aria.includes('next') || title.includes('next')) return true;
      if (/^next\b/i.test(text) && text.length < 12) return true;
      return false;
    });
    if (!next) {
      return { ok: false, reason: 'Next page control not found' };
    }
    const disabled =
      next.getAttribute('disabled') != null ||
      next.getAttribute('aria-disabled') === 'true' ||
      /disabled|inactive/i.test(next.className);
    if (disabled) {
      return { ok: false, reason: 'Already on the last page' };
    }
    clickInSameTab(next);
    return { ok: true };
  }

  /** Bump Naukri search URL to the next results page when Next click fails. */
  nextSearchPageUrl(currentUrl: string): string | null {
    try {
      const u = new URL(currentUrl);
      for (const key of ['page', 'pageNo', 'startPage']) {
        const pageQ = u.searchParams.get(key);
        if (pageQ && /^\d+$/.test(pageQ)) {
          u.searchParams.set(key, String(Number(pageQ) + 1));
          return u.toString();
        }
      }
      // Naukri path style: /foo-jobs → /foo-jobs-2 → /foo-jobs-3
      const m = u.pathname.match(/^(.*?-jobs)(?:-(\d+))?\/?$/i);
      if (m) {
        const base = m[1]!;
        const n = m[2] ? Number(m[2]) : 1;
        u.pathname = `${base}-${n + 1}`;
        return u.toString();
      }
      const loose = u.pathname.match(/^(.*?)(?:-(\d+))?\/?$/);
      if (loose) {
        const base = loose[1]!;
        const n = loose[2] ? Number(loose[2]) : 1;
        if (base.length > 1) {
          u.pathname = `${base}-${n + 1}`;
          return u.toString();
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

export function matchesPreferences(
  job: SearchResultJob,
  prefs: JobPreferences,
  options?: { requireDisclosedSalary?: boolean }
): boolean {
  return preferenceSkipReason(job, prefs, options) == null;
}

/** List scan: allow missing salary on cards; still require title/keyword match. */
export function matchesListCandidate(
  job: SearchResultJob,
  prefs: JobPreferences
): boolean {
  return preferenceSkipReason(job, prefs, { requireDisclosedSalary: false }) == null;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleMatchesPreference(jobTitle: string, prefTitle: string): boolean {
  const jt = normalizeMatchText(jobTitle);
  const pt = normalizeMatchText(prefTitle);
  if (!jt || !pt) return false;
  if (jt.includes(pt) || pt.includes(jt)) return true;
  const tokens = pt.split(' ').filter((t) => t.length > 1);
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => jt.includes(t)).length;
  return hits >= Math.ceil(tokens.length * 0.6);
}

/** Title and keyword gate after salary is disclosed. */
export function matchesTitleAndKeywords(
  job: SearchResultJob,
  prefs: JobPreferences
): boolean {
  const titles = prefs.titles.map((t) => t.trim()).filter(Boolean);
  const keywords = prefs.keywords.map((k) => k.trim()).filter(Boolean);
  if (!titles.length && !keywords.length) return false;

  const jobTitle = job.title ?? '';
  const haystack = [
    job.title,
    job.company,
    job.location,
    ...(job.skills ?? []),
    job.description ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const titleHit = titles.some((t) => titleMatchesPreference(jobTitle, t));
  const keywordHit = keywords.some((k) =>
    normalizeMatchText(haystack).includes(normalizeMatchText(k))
  );

  if (titles.length && keywords.length) return titleHit && keywordHit;
  if (titles.length) return titleHit;
  return keywordHit;
}

/** Human-readable reason when a job fails preference gates (null = ok to apply). */
export function preferenceSkipReason(
  job: SearchResultJob,
  prefs: JobPreferences,
  options?: { requireDisclosedSalary?: boolean }
): string | null {
  const requireSalary = options?.requireDisclosedSalary !== false;

  if (prefs.experienceMin > 0 || prefs.experienceMax < 50) {
    const exp = job.experienceText ?? '';
    const nums = [...exp.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) =>
      Number(m[1])
    );
    if (nums.length >= 1) {
      const low = nums[0]!;
      const high = nums[1] ?? low;
      if (high < prefs.experienceMin || low > prefs.experienceMax) {
        return `Experience ${exp || 'out of range'} outside ${prefs.experienceMin}–${prefs.experienceMax} yrs`;
      }
    }
  }

  const salaryRange = parseSalaryLpaRange(job.salaryText);
  if (requireSalary || job.salaryText?.trim()) {
    if (!salaryRange) {
      const raw = job.salaryText?.trim();
      if (raw && /not\s*disclosed|undisclosed/i.test(raw)) {
        return 'Salary not disclosed';
      }
      return raw ? `Salary not usable (${raw})` : 'Salary not disclosed';
    }
    if (
      prefs.minSalaryLpa != null &&
      prefs.minSalaryLpa > 0 &&
      salaryRange.max < prefs.minSalaryLpa
    ) {
      return `Salary below minimum (${job.salaryText?.trim() || `${salaryRange.max} LPA`} < ${prefs.minSalaryLpa} LPA)`;
    }
  }

  const titles = prefs.titles.map((t) => t.trim()).filter(Boolean);
  const keywords = prefs.keywords.map((k) => k.trim()).filter(Boolean);
  if (!titles.length && !keywords.length) {
    return 'No titles or keywords in preferences';
  }

  const titleHit = titles.some((t) => titleMatchesPreference(job.title ?? '', t));
  const haystack = [
    job.title,
    job.company,
    job.location,
    ...(job.skills ?? []),
    job.description ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const keywordHit = keywords.some((k) =>
    normalizeMatchText(haystack).includes(normalizeMatchText(k))
  );

  if (titles.length && keywords.length) {
    if (!titleHit && !keywordHit) {
      return 'Title and keywords did not match preferences';
    }
    if (!titleHit) return 'Job title did not match preferred titles';
    if (!keywordHit) return 'Keywords did not match job skills/description';
  } else if (titles.length && !titleHit) {
    return 'Job title did not match preferred titles';
  } else if (keywords.length && !keywordHit) {
    return 'Keywords did not match job skills/description';
  }

  return null;
}
