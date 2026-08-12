import type { JobPreferences } from '@cosmo/shared';

/** Local copy so the extension never bundles Zod from @cosmo/shared. */
export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  titles: ['Software Engineer', 'Software Developer', 'Full Stack Developer'],
  keywords: ['Spring Boot', 'React.js', 'Java', 'JavaScript'],
  locations: ['Bengaluru', 'Remote'],
  experienceMin: 0,
  experienceMax: 5,
  minSalaryLpa: 2,
  workMode: 'any',
  autoScanEnabled: true,
  autoApplyEnabled: true,
};

export function jobPreferencesAreUnset(
  prefs: Partial<JobPreferences> | null | undefined
): boolean {
  if (!prefs) return true;
  return !(prefs.titles?.length) && !(prefs.keywords?.length);
}

export function resolveAutomationFlags(
  prefs: Partial<JobPreferences> | null | undefined
): Pick<JobPreferences, 'autoScanEnabled' | 'autoApplyEnabled'> {
  const scan = prefs?.autoScanEnabled ?? true;
  const applyRaw = prefs?.autoApplyEnabled;
  const legacyApplyOff = applyRaw === false && scan !== false;
  return {
    autoScanEnabled: scan !== false,
    autoApplyEnabled: applyRaw == null || legacyApplyOff ? true : applyRaw,
  };
}

export function resolveJobPreferences(
  prefs: Partial<JobPreferences> | null | undefined
): JobPreferences {
  if (jobPreferencesAreUnset(prefs)) {
    return { ...DEFAULT_JOB_PREFERENCES };
  }
  return {
    ...DEFAULT_JOB_PREFERENCES,
    titles: prefs!.titles ?? [],
    keywords: prefs!.keywords ?? [],
    locations: prefs!.locations ?? [],
    experienceMin: prefs!.experienceMin ?? DEFAULT_JOB_PREFERENCES.experienceMin,
    experienceMax: prefs!.experienceMax ?? DEFAULT_JOB_PREFERENCES.experienceMax,
    minSalaryLpa: prefs!.minSalaryLpa ?? DEFAULT_JOB_PREFERENCES.minSalaryLpa,
    workMode: prefs!.workMode ?? DEFAULT_JOB_PREFERENCES.workMode,
    ...resolveAutomationFlags(prefs),
  };
}
