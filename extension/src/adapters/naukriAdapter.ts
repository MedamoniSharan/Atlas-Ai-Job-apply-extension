import type { JobPayload } from '@atlas/shared';
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
  ],
  loggedIn: [
    '#login_Layer',
    '.nI-gNb-drawer__icon',
    '[data-ga-track*="profile"]',
  ],
};

export class NaukriAdapter implements PlatformAdapter {
  readonly platform = 'naukri' as const;

  matches(url: string): boolean {
    try {
      const u = new URL(url);
      return (
        (u.hostname === 'www.naukri.com' || u.hostname === 'naukri.com') &&
        (u.pathname.includes('/job-listings') ||
          u.pathname.includes('/jobdescription') ||
          /-\d+$/.test(u.pathname) ||
          u.pathname.includes('/jobs'))
      );
    } catch {
      return false;
    }
  }

  isLoggedIn(doc: Document = document): boolean {
    // Login CTA present usually means logged out on Naukri.
    const loginCta = doc.querySelector('#login_Layer');
    if (loginCta) return false;
    return Boolean(
      queryFirst(naukriSelectors.loggedIn.filter((s) => s !== '#login_Layer'), doc) ||
        doc.cookie.includes('naukri')
    );
  }

  readJob(doc: Document = document): Partial<JobPayload> | null {
    const title = textOf(naukriSelectors.title, doc);
    const company = textOf(naukriSelectors.company, doc);
    if (!title || !company) return null;

    const location = textOf(naukriSelectors.location, doc);
    const externalJobId =
      doc.querySelector('[data-job-id]')?.getAttribute('data-job-id') ??
      undefined;

    return {
      platform: this.platform,
      title,
      company,
      location,
      externalJobId,
      url: doc.location?.href,
      status: 'detected',
    };
  }

  detectApplicationStatus(
    doc: Document = document
  ): JobPayload['status'] | null {
    if (queryFirst(naukriSelectors.applySuccess, doc)) {
      return 'applied';
    }
    return null;
  }
}
