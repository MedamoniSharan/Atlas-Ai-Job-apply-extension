/** Canonical site origin for SEO (production). */
export const SITE_ORIGIN = 'https://www.cosmovai.in';

export const SITE_NAME = 'Cosmo';
export const ORG_NAME = 'Cosmovai';
export const PRODUCT_NAME = 'Cosmo Job Assistant';

export const DEFAULT_TITLE = 'Cosmo — Naukri job co-pilot';
export const DEFAULT_DESCRIPTION =
  'Cosmo is a Naukri Easy Apply co-pilot and application tracker. Scan listings from your preferences, assist applies at a human pace, and sync everything to your Cosmo dashboard.';

export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/cosmo-job-assistant/gdapodjlojmapjdopfdnmhfhhlfamgkb';

export const SUPPORT_EMAIL = 'support@cosmovai.com';

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export function titleWithBrand(pageTitle: string): string {
  if (pageTitle.includes(SITE_NAME)) return pageTitle;
  return `${pageTitle} | ${SITE_NAME}`;
}
