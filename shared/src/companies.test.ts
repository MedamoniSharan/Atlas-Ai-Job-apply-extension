import { describe, expect, it } from 'vitest';
import {
  companyJobIdentity,
  decodeCompanyKey,
  encodeCompanyKey,
  isUsableCompanyLogo,
  normalizeCompanyName,
  pickBestCompanyLogo,
  sanitizeAboutCompany,
  withCompanyLogos,
} from './companies';

describe('companies helpers', () => {
  it('normalizes company names', () => {
    expect(normalizeCompanyName('  Remote.com  ')).toBe('remote.com');
    expect(normalizeCompanyName('Acme   Labs')).toBe('acme labs');
  });

  it('round-trips company keys', () => {
    const key = encodeCompanyKey('Remote.com');
    expect(decodeCompanyKey(key)).toBe('remote.com');
  });

  it('builds stable job identities', () => {
    expect(
      companyJobIdentity({
        platform: 'naukri',
        externalJobId: '123',
        title: 'Engineer',
      })
    ).toBe('naukri|id:123');
    expect(
      companyJobIdentity({
        platform: 'naukri',
        url: 'https://www.naukri.com/job-listings-foo?x=1',
        title: 'Engineer',
      })
    ).toBe('naukri|url:https://www.naukri.com/job-listings-foo');
  });

  it('rejects Naukri placeholder logos and picks group logos', () => {
    expect(isUsableCompanyLogo('https://img.naukimg.com/logo.png')).toBe(false);
    expect(
      isUsableCompanyLogo(
        'https://static.naukimg.com/s/9/121/_next/static/media/award-left-wing.bf13643f.png'
      )
    ).toBe(false);
    expect(
      isUsableCompanyLogo(
        'https://static.naukimg.com/s/0/0/i/naukri-identity/naukri_gnb_logo.svg'
      )
    ).toBe(false);
    expect(
      isUsableCompanyLogo(
        'https://img.naukimg.com/logo_images/groups/v1/468918.gif'
      )
    ).toBe(true);
    expect(
      pickBestCompanyLogo(
        'https://img.naukimg.com/logo.png',
        'https://static.naukimg.com/s/9/121/_next/static/media/award-left-wing.bf13643f.png',
        'https://img.naukimg.com/logo_images/groups/v1/468918.gif',
        'https://cdn.example.com/brand.png'
      )
    ).toBe('https://img.naukimg.com/logo_images/groups/v1/468918.gif');
  });

  it('backfills company logos onto jobs missing them', () => {
    const logo =
      'https://img.naukimg.com/logo_images/groups/v1/468918.gif';
    const jobs = withCompanyLogos(
      [
        { id: '1', companyLogo: 'https://img.naukimg.com/logo.png' },
        { id: '2' },
        { id: '3', companyLogo: logo },
      ],
      logo
    );
    expect(jobs.every((j) => j.companyLogo === logo)).toBe(true);
  });

  it('formats mashed Naukri about-company blobs', () => {
    const raw =
      'About company3.7 2.2K employee reviewsIT Services & ConsultingForeign MNCFollowing 309.6k followers OverviewEPAM is a leading digital transformation services and product engineering company. Since 1993 we have used our software engineering expertise.EPAM India has 13000+ employees.Life of a Lead Test Automation EngineerCompany InfoAddress Newtown, Pennsylvania';
    const cleaned = sanitizeAboutCompany(raw);
    expect(cleaned).toMatch(/^EPAM is a leading/i);
    expect(cleaned).toMatch(/software engineering expertise/i);
    expect(cleaned).not.toMatch(/employee reviews/i);
    expect(cleaned).not.toMatch(/Life of a/i);
    expect(cleaned).not.toMatch(/Newtown/i);
  });

  it('repairs mojibake and avoids mid-word truncation', () => {
    const raw =
      "About Accenture Accenture is a global professional services company with leading capabilities in Digital, Cloud and Security. Combining unmatched experience and specialized skills across more than 40 industries, we offer Strategy and Consulting, Interactive, Technology and Operations services €” all powered by the world€™s largest network of Advanced Technology and Intelligent Operations centers. Our people continue to deliver outstanding outcomes for clients every day.";
    const cleaned = sanitizeAboutCompany(raw, {
      maxLen: 4000,
      maxSentences: 16,
    });
    expect(cleaned).toMatch(/^Accenture is a global/i);
    expect(cleaned).toContain("world's");
    expect(cleaned).toContain('—');
    expect(cleaned).not.toMatch(/O\.\.\.$/);
    expect(cleaned?.endsWith('.')).toBe(true);
  });
});
