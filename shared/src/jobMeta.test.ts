import { describe, expect, it } from 'vitest';
import {
  sanitizeJobMetaFields,
  splitExperienceSalary,
  splitPostedApplicants,
  stripEmbeddedLabels,
} from './jobMeta';

describe('jobMeta', () => {
  it('splits glued experience and salary', () => {
    expect(splitExperienceSalary('0 - 1 yearsNot Disclosed')).toEqual({
      experience: '0 - 1 years',
      salary: 'Not Disclosed',
    });
  });

  it('splits glued posted and applicants', () => {
    expect(splitPostedApplicants('1 day agoApplicants: 100+')).toEqual({
      postedAt: '1 day ago',
      applicants: '100+',
    });
  });

  it('strips embedded labels from role blob', () => {
    expect(
      stripEmbeddedLabels(
        'Industrial Engineer, Industry Type: IT Services & Consulting, Department: Production'
      )
    ).toBe('Industrial Engineer');
  });

  it('strips role category from employment type', () => {
    expect(
      stripEmbeddedLabels('Full Time, PermanentRole Category: Engineering')
    ).toBe('Full Time, Permanent');
  });

  it('sanitizes a full noisy payload', () => {
    expect(
      sanitizeJobMetaFields({
        experience: '0 - 1 yearsNot Disclosed',
        postedAt: '1 day agoApplicants: 100+',
        role: 'Prompt Engineer, Industry Type: IT Services',
        employmentType: 'Full Time, PermanentRole Category: Engineering',
      })
    ).toEqual({
      experience: '0 - 1 years',
      salary: 'Not Disclosed',
      postedAt: '1 day ago',
      openings: undefined,
      applicants: '100+',
      role: 'Prompt Engineer',
      industry: undefined,
      department: undefined,
      employmentType: 'Full Time, Permanent',
      roleCategory: undefined,
      education: undefined,
    });
  });
});
