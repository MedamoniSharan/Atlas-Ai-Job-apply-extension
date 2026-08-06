/** Chrome Web Store listing (public). */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/cosmo-job-assistant/gdapodjlojmapjdopfdnmhfhhlfamgkb';

/**
 * Primary Chrome install URL — Web Store by default.
 * Override with VITE_CHROME_EXTENSION_URL if needed.
 */
export const CHROME_EXTENSION_URL =
  import.meta.env.VITE_CHROME_EXTENSION_URL?.trim() || CHROME_WEB_STORE_URL;

/** @deprecated Zip fallback kept for local packaging only. */
export const CHROME_EXTENSION_ZIP_URL = '/cosmo-chrome-extension.zip';
export const CHROME_EXTENSION_ZIP_FILENAME = 'cosmo-chrome-extension.zip';
