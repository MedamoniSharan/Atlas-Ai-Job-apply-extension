import { describe, expect, it } from 'vitest';
import {
  NaukriAdapter,
  naukriSelectors,
  buildNaukriSearchUrl,
  matchesPreferences,
} from './naukriAdapter';
import { backoffMs } from '../core/queueManager';
import { DEFAULT_JOB_PREFERENCES } from '../core/defaults';

describe('NaukriAdapter', () => {
  it('matches naukri job URLs', () => {
    const adapter = new NaukriAdapter();
    expect(
      adapter.matches(
        'https://www.naukri.com/job-listings-frontend-engineer-123'
      )
    ).toBe(true);
    expect(
      adapter.matches('https://www.naukri.com/software-developer-jobs?k=react')
    ).toBe(true);
    expect(adapter.matches('https://linkedin.com/jobs/view/1')).toBe(false);
  });

  it('exposes a selector registry', () => {
    expect(naukriSelectors.title.length).toBeGreaterThan(0);
    expect(naukriSelectors.company.length).toBeGreaterThan(0);
  });

  it('reads job fields from fixture DOM', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <h1 class="jd-header-title">Frontend Engineer</h1>
      <div class="jd-header-comp-name"><a>Atlas Labs</a></div>
      <div class="loc"><span>Bengaluru</span></div>
    `;
    const job = adapter.readJob(document);
    expect(job?.title).toBe('Frontend Engineer');
    expect(job?.company).toBe('Atlas Labs');
    expect(job?.location).toBe('Bengaluru');
  });

  it('reads hashed CSS-module JD classes from Naukri SPA', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <h1 class="styles_jd-header-title__rZwM1">Software Developer-Senior I</h1>
      <div class="styles_jd-header-comp-name__MvqAI">
        <a href="/fedex-jobs">FedEx</a>
        <div>4.0 1.4K Reviews</div>
      </div>
    `;
    const job = adapter.readJob(document);
    expect(job?.title).toBe('Software Developer-Senior I');
    expect(job?.company).toBe('FedEx');
  });

  it('scrapes search result cards', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="srp-jobtuple-wrapper" data-job-id="200426503000">
        <a class="title" href="https://www.naukri.com/job-listings-software-developer-senior-i-fedex-200426503000">Software Developer-Senior I</a>
        <a class="comp-name" href="#">FedEx</a>
        <span class="expwdth">7-9 Yrs</span>
        <span class="locWdth">Hyderabad</span>
        <span class="sal">15-25 Lacs PA</span>
      </div>
    `;
    const jobs = adapter.readSearchResults(document);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Software Developer-Senior I');
    expect(jobs[0]?.company).toBe('FedEx');
    expect(jobs[0]?.externalJobId).toBe('200426503000');
  });

  it('detects mandatory-question banners from Naukri', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div>
        Oops! Your application was not accepted due to incomplete information.
        Please answer all mandatory questions when reapplying.
      </div>
    `;
    expect(adapter.detectNeedsUserQuestions(document)).toMatch(/mandatory/i);
  });

  it('treats Login/Register header as logged out', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <a id="login_Layer" class="nI-gNb-lg-rg__login" href="/login">Login</a>
      <a id="register_Layer" class="nI-gNb-lg-rg__register" href="/register">Register</a>
    `;
    document.cookie = 'naukri=1';
    expect(adapter.isLoggedIn(document)).toBe(false);
  });

  it('treats profile drawer as logged in', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `<div class="nI-gNb-drawer__icon"></div>`;
    expect(adapter.isLoggedIn(document)).toBe(true);
  });
});

describe('preference matching helpers', () => {
  it('builds a naukri search URL from prefs', () => {
    const url = buildNaukriSearchUrl({
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer'],
      keywords: ['React'],
      locations: ['Bengaluru'],
    });
    expect(url).toContain('naukri.com');
    expect(url).toContain('k=');
    expect(url).toContain('Bengaluru');
  });

  it('filters by experience range', () => {
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      experienceMin: 2,
      experienceMax: 5,
    };
    expect(
      matchesPreferences(
        {
          title: 'Dev',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-1',
          experienceText: '0-1 Yrs',
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Dev',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-1',
          experienceText: '3-4 Yrs',
        },
        prefs
      )
    ).toBe(true);
  });
});

describe('queue backoff', () => {
  it('grows exponentially and caps', () => {
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(1)).toBe(4000);
    expect(backoffMs(10)).toBe(5 * 60 * 1000);
  });
});
