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
  ],
  loggedIn: [
    '.nI-gNb-drawer__icon',
    '.nI-gNb-drawer',
    '[data-ga-track*="profile"]',
    '.user-name',
    '.nI-gNb-icon-and-drawer',
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

function absoluteUrl(src?: string | null): string | undefined {
  if (!src || src.startsWith('data:')) return undefined;
  try {
    return new URL(src, 'https://www.naukri.com').href;
  } catch {
    return undefined;
  }
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
    // Explicit logged-out header controls.
    if (queryFirst(naukriSelectors.loggedOut, doc)) {
      return false;
    }

    // Require a positive logged-in signal. Never use cookies — Naukri sets
    // cookies even when logged out, which previously caused false positives.
    return Boolean(queryFirst(naukriSelectors.loggedIn, doc));
  }

  readJob(doc: Document = document): Partial<JobPayload> | null {
    const title = textOf(naukriSelectors.title, doc);
    const company = textOf(naukriSelectors.company, doc);
    if (!title || !company) return null;

    const location = textOf(naukriSelectors.location, doc);
    const href = doc.location?.href ?? '';
    const externalJobId =
      doc.querySelector('[data-job-id]')?.getAttribute('data-job-id') ??
      jobIdFromUrl(href);

    const logoEl =
      (doc.querySelector(
        'img.logoImage, img[alt="companyLogo"], [class*="jd-header"] img, [class*="company-logo"] img'
      ) as HTMLImageElement | null) ?? null;
    const companyLogo = absoluteUrl(logoEl?.src);

    const description =
      cleanText(
        doc.querySelector(
          '.job-desc, [class*="job-desc"], [class*="styles_job-desc"], #job-description, [class*="description"]'
        )?.textContent
      )?.slice(0, 1200) || undefined;

    const experience =
      cleanText(
        doc.querySelector(
          '.expwdth, [class*="experience"], .styles_jhc__exp__'
        )?.textContent
      ) || undefined;
    const salary =
      cleanText(
        doc.querySelector('.sal, [class*="salary"], .styles_jhc__salary__')
          ?.textContent
      ) || undefined;
    const rating =
      cleanText(doc.querySelector('.rating .main-2, [class*="rating"] .main-2')?.textContent) ||
      undefined;

    const skills = Array.from(
      doc.querySelectorAll(
        '.chip, [class*="chip"], [class*="key-skill"] span, [class*="skills"] span'
      )
    )
      .map((el) => cleanText(el.textContent))
      .filter((s): s is string => Boolean(s))
      .slice(0, 20);

    return {
      platform: this.platform,
      title: cleanText(title) || title,
      company: cleanCompany(company),
      location: cleanText(location),
      externalJobId,
      url: href,
      companyLogo,
      description,
      experience,
      salary,
      skills: skills.length ? skills : undefined,
      rating,
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
      const skills = Array.from(root.querySelectorAll('.tag-li, .tag, [class*="skill"] span'))
        .map((el) => cleanText(el.textContent))
        .filter((s): s is string => Boolean(s))
        .slice(0, 12);

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
      });
    }

    return results;
  }

  detectApplicationStatus(
    doc: Document = document
  ): JobPayload['status'] | null {
    if (queryFirst(naukriSelectors.applySuccess, doc)) {
      return 'applied';
    }
    return null;
  }

  findEasyApplyButton(doc: Document = document): HTMLElement | null {
    const buttons = Array.from(
      doc.querySelectorAll('button, a, [role="button"]')
    ) as HTMLElement[];
    for (const btn of buttons) {
      const label = (btn.textContent || '').trim().toLowerCase();
      if (!label) continue;
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
