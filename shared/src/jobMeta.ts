const EMBEDDED_LABEL_RE =
  /,?\s*(?:Industry Type|Department|Employment Type|Role Category|Education|Posted|Applicants?|Openings?)\s*:/i;

function clean(value?: string | null): string | undefined {
  const t = value?.replace(/\s+/g, ' ').trim();
  return t || undefined;
}

/** Drop text accidentally scraped from the next Naukri detail label onward. */
export function stripEmbeddedLabels(value?: string | null): string | undefined {
  const t = clean(value);
  if (!t) return undefined;
  const match = t.match(EMBEDDED_LABEL_RE);
  if (match?.index != null && match.index > 0) {
    return clean(t.slice(0, match.index).replace(/,\s*$/, ''));
  }
  return t;
}

/** Split glued header values like "0 - 1 yearsNot Disclosed". */
export function splitExperienceSalary(combined?: string | null): {
  experience?: string;
  salary?: string;
} {
  const raw = clean(combined);
  if (!raw) return {};

  const glued = raw.match(
    /^(.+?(?:years?|yrs?))((?:Not\s*Disclosed)|(?:₹|[\d][\d,.]*(?:\s*-\s*[\d,.]+)?\s*(?:L(?:acs?|PA|akh)?|Cr(?:ore)?(?:\s*PA)?)))/i
  );
  if (glued) {
    return { experience: clean(glued[1]), salary: clean(glued[2]) };
  }

  return { experience: raw };
}

/** Split glued stats like "1 day agoApplicants: 100+". */
export function splitPostedApplicants(combined?: string | null): {
  postedAt?: string;
  applicants?: string;
} {
  const raw = clean(combined);
  if (!raw) return {};

  const applicants = clean(raw.match(/Applicants?\s*:\s*([^\n|]+)/i)?.[1]);
  let postedAt = clean(
    raw.match(/Posted\s*:\s*([^\n|]+)/i)?.[1] ||
      raw.match(
        /(\d+\s*(?:day|days|hour|hours|minute|minutes|week|weeks|month|months)\s*ago)/i
      )?.[1]
  );

  if (postedAt && /Applicants?\s*:/i.test(postedAt)) {
    postedAt = clean(postedAt.replace(/Applicants?\s*:\s*.+$/i, ''));
  }

  if (postedAt || applicants) {
    return { postedAt, applicants };
  }

  return { postedAt: raw };
}

export type JobMetaFields = {
  experience?: string | null;
  salary?: string | null;
  postedAt?: string | null;
  openings?: string | null;
  applicants?: string | null;
  role?: string | null;
  industry?: string | null;
  department?: string | null;
  employmentType?: string | null;
  roleCategory?: string | null;
  education?: string | null;
};

/** Normalize Naukri meta fields scraped from noisy DOM text. */
export function sanitizeJobMetaFields(fields: JobMetaFields): JobMetaFields {
  let experience = fields.experience ?? undefined;
  let salary = fields.salary ?? undefined;

  if (experience && !salary) {
    const split = splitExperienceSalary(experience);
    experience = split.experience ?? experience;
    salary = split.salary;
  }

  let postedAt = fields.postedAt ?? undefined;
  let applicants = fields.applicants ?? undefined;
  if (postedAt && /Applicants?\s*:/i.test(postedAt)) {
    const split = splitPostedApplicants(postedAt);
    postedAt = split.postedAt ?? postedAt;
    applicants = applicants ?? split.applicants;
  }

  return {
    experience: stripEmbeddedLabels(experience),
    salary: stripEmbeddedLabels(salary),
    postedAt: stripEmbeddedLabels(postedAt),
    openings: stripEmbeddedLabels(fields.openings),
    applicants: stripEmbeddedLabels(applicants),
    role: stripEmbeddedLabels(fields.role),
    industry: stripEmbeddedLabels(fields.industry),
    department: stripEmbeddedLabels(fields.department),
    employmentType: stripEmbeddedLabels(fields.employmentType),
    roleCategory: stripEmbeddedLabels(fields.roleCategory),
    education: stripEmbeddedLabels(fields.education),
  };
}
