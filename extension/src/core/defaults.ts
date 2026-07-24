import type { JobPreferences } from '@cosmo/shared';

/** Local copy so the extension never bundles Zod from @cosmo/shared. */
export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  titles: [],
  keywords: [],
  locations: [],
  experienceMin: 0,
  experienceMax: 30,
  workMode: 'any',
  autoScanEnabled: true,
  autoApplyEnabled: false,
};
