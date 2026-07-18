import type { JobPreferences } from '@atlas/shared';

/** Local copy so the extension never bundles Zod from @atlas/shared. */
export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  titles: [],
  keywords: [],
  locations: [],
  experienceMin: 0,
  experienceMax: 30,
  workMode: 'any',
  autoScanEnabled: true,
  autoApplyEnabled: false,
  dailyApplyLimit: 10,
};
