import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOB_PREFERENCES,
  jobPreferencesAreUnset,
  preferencesAreComplete,
  resolveJobPreferences,
} from './models';

describe('resolveJobPreferences', () => {
  it('uses defaults when the user has not set titles or keywords', () => {
    expect(jobPreferencesAreUnset(null)).toBe(true);
    expect(jobPreferencesAreUnset({})).toBe(true);
    expect(jobPreferencesAreUnset({ titles: [], keywords: [] })).toBe(true);
    expect(resolveJobPreferences(null)).toEqual(DEFAULT_JOB_PREFERENCES);
    expect(resolveJobPreferences({ experienceMax: 8 })).toEqual(
      DEFAULT_JOB_PREFERENCES
    );
    expect(preferencesAreComplete(resolveJobPreferences(null))).toBe(true);
  });

  it('keeps saved chips and only fills missing numeric filters', () => {
    const saved = resolveJobPreferences({
      titles: ['Java Developer'],
      keywords: ['Java', 'Spring', 'SQL', 'Microservices'],
      locations: [],
    });
    expect(saved.titles).toEqual(['Java Developer']);
    expect(saved.keywords).toEqual(['Java', 'Spring', 'SQL', 'Microservices']);
    expect(saved.locations).toEqual([]);
    expect(saved.experienceMin).toBe(0);
    expect(saved.experienceMax).toBe(5);
    expect(saved.minSalaryLpa).toBe(2);
    expect(saved.autoScanEnabled).toBe(true);
    expect(saved.autoApplyEnabled).toBe(true);
    expect(jobPreferencesAreUnset(saved)).toBe(false);
  });

  it('enables auto-scan and auto-apply by default, including legacy apply-off', () => {
    expect(resolveJobPreferences(null).autoScanEnabled).toBe(true);
    expect(resolveJobPreferences(null).autoApplyEnabled).toBe(true);
    const migrated = resolveJobPreferences({
      titles: ['Software Engineer', 'Software Developer', 'Full Stack Developer'],
      keywords: ['Java', 'Spring Boot', 'React.js', 'JavaScript'],
      autoScanEnabled: true,
      autoApplyEnabled: false,
    });
    expect(migrated.autoScanEnabled).toBe(true);
    expect(migrated.autoApplyEnabled).toBe(true);
    const bothOff = resolveJobPreferences({
      titles: ['Software Engineer', 'Software Developer', 'Full Stack Developer'],
      keywords: ['Java', 'Spring Boot', 'React.js', 'JavaScript'],
      autoScanEnabled: false,
      autoApplyEnabled: false,
    });
    expect(bothOff.autoScanEnabled).toBe(false);
    expect(bothOff.autoApplyEnabled).toBe(false);
  });
});
