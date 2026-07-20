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

  it('treats successfully-applied pages as applied, not questions', () => {
    const adapter = new NaukriAdapter();
    Object.defineProperty(document, 'location', {
      value: { href: 'https://www.naukri.com/myapply/saveApply?strJobsarr=1' },
      configurable: true,
    });
    document.body.innerHTML = `
      <div>You have successfully applied to 'Development Interns'</div>
      <aside class="sidebar">
        <input type="text" />
        <input type="text" />
        <div>Any questions about interview prep?</div>
      </aside>
    `;
    expect(adapter.detectApplicationStatus(document)).toBe('applied');
    expect(adapter.detectNeedsUserQuestions(document)).toBeNull();
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

  it('treats hidden Login button + profile drawer as logged in', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <a id="login_Layer" class="nI-gNb-lg-rg__login" href="/login" style="display:none">Login</a>
      <div class="nI-gNb-drawer">
        <img class="nI-gNb-icon-img" src="https://img.naukimg.com/profile/photo.jpg" />
        <span class="nI-gNb-info__subtxt">Sharan</span>
      </div>
    `;
    expect(adapter.isLoggedIn(document)).toBe(true);
  });

  it('treats my.naukri profile link as logged in', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <a href="https://www.naukri.com/mnjuser/homepage">My Naukri</a>
    `;
    expect(adapter.isLoggedIn(document)).toBe(true);
  });
  it('scrapes rich Naukri JD detail fields', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <h1 class="jd-header-title">Java Software Developer</h1>
      <div class="jd-header-comp-name">
        <a>moglix</a>
        <div class="rating"><span class="main-2">3.3</span></div>
        <a href="/reviews">718 Reviews</a>
      </div>
      <img class="logoImage" alt="companyLogo" src="https://img.naukimg.com/logo.png" />
      <span class="expwdth">0 - 1 years</span>
      <span class="sal">3-6 Lacs P.A.</span>
      <div class="loc"><span>Hyderabad</span></div>
      <div class="styles_jhc__stat__abc">
        Posted: 1 day ago | Openings: 1 | Applicants: 100+
      </div>
      <section class="styles_highlight__x">
        <h2>Job highlights</h2>
        <ul>
          <li>Experience with Java, Spring Boot, Elasticsearch, Redis, and Google Cloud Platform services</li>
          <li>Develop and maintain backend applications, design RESTful APIs, manage databases</li>
        </ul>
      </section>
      <h2>Job description</h2>
      <div class="styles_job-desc__y">
        <h3>Role &amp; responsibilities</h3>
        <p>Develop and maintain backend applications using Java and Spring Boot.</p>
        <h3>Preferred candidate profile</h3>
        <p>Good knowledge of Java and Object-Oriented Programming (OOP).</p>
      </div>
      <div class="styles_other-details__z">
        <label>Role</label><span>Technology / IT - Other</span>
        <label>Industry Type</label><span>IT Services &amp; Consulting</span>
        <label>Department</label><span>Project &amp; Program Management</span>
        <label>Employment Type</label><span>Full Time, Permanent</span>
        <label>Role Category</label><span>Technology / IT</span>
        <label>Education</label><span>UG: B.Tech / B.E. in Any Specialization</span>
      </div>
      <div class="styles_key-skill__k">
        <span class="chip">Java</span>
        <span class="chip">Spring Boot Framework</span>
        <span class="chip">Microservices</span>
        <span class="chip">J2EE</span>
        <span class="chip">AWS</span>
        <span class="chip">SQL</span>
      </div>
      <h2>About company</h2>
      <div>Moglix is a B2B commerce company focused on industrial supplies.</div>
    `;
    const job = adapter.readJob(document);
    expect(job?.title).toBe('Java Software Developer');
    expect(job?.company).toBe('moglix');
    expect(job?.location).toBe('Hyderabad');
    expect(job?.experience).toMatch(/0\s*-\s*1/i);
    expect(job?.salary).toMatch(/3-6/i);
    expect(job?.rating).toBe('3.3');
    expect(job?.reviews).toMatch(/718/i);
    expect(job?.postedAt).toMatch(/1 day ago/i);
    expect(job?.openings).toBe('1');
    expect(job?.applicants).toMatch(/100\+/);
    expect(job?.highlights?.length).toBeGreaterThan(0);
    expect(job?.skills).toEqual(
      expect.arrayContaining(['Java', 'Spring Boot Framework', 'SQL'])
    );
    expect(job?.role).toMatch(/Technology \/ IT - Other/i);
    expect(job?.industry).toMatch(/IT Services/i);
    expect(job?.department).toMatch(/Project/i);
    expect(job?.employmentType).toMatch(/Full Time/i);
    expect(job?.roleCategory).toMatch(/Technology \/ IT/i);
    expect(job?.education).toMatch(/B\.Tech/i);
    expect(job?.description).toMatch(/Spring Boot/i);
    expect(job?.aboutCompany).toMatch(/Moglix/i);
    expect(job?.companyLogo).toContain('naukimg.com');
  });
  it('skips company-site apply jobs from search results', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="srp-jobtuple-wrapper" data-job-id="111">
        <a class="title" href="https://www.naukri.com/job-listings-easy-111">Easy Apply Role</a>
        <a class="comp-name" href="#">Acme</a>
        <button type="button">Apply</button>
      </div>
      <div class="srp-jobtuple-wrapper" data-job-id="222">
        <a class="title" href="https://www.naukri.com/job-listings-external-222">External Role</a>
        <a class="comp-name" href="#">OtherCo</a>
        <button type="button">Apply on company site</button>
      </div>
    `;
    const jobs = adapter.readSearchResults(document);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Easy Apply Role');
  });

  it('detects company-site apply on job detail pages', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <h1 class="jd-header-title">Backend Engineer</h1>
      <div class="jd-header-comp-name"><a>Acme</a></div>
      <button type="button">Apply on company site</button>
    `;
    expect(adapter.isCompanySiteApply(document)).toBe(true);
    expect(adapter.findEasyApplyButton(document)).toBeNull();
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
