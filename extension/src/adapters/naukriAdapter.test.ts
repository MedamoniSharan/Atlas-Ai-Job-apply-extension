import { describe, expect, it } from 'vitest';
import {
  NaukriAdapter,
  naukriSelectors,
  buildNaukriSearchQueryPlan,
  buildNaukriSearchUrl,
  matchesPreferences,
  hasNaukriSessionCookieHint,
  salaryMeetsMinimum,
  ctcFiltersForMinSalary,
  salaryBucketLabelsForMin,
  workModeFilterLabel,
  wfhTypeForWorkMode,
  applyPreferenceFilters,
  preferenceFiltersAlreadyApplied,
  preferenceSkipReason,
  searchUrlHasPreferenceFilters,
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
      <div class="jd-header-comp-name"><a>Cosmo Labs</a></div>
      <div class="loc"><span>Bengaluru</span></div>
    `;
    const job = adapter.readJob(document);
    expect(job?.title).toBe('Frontend Engineer');
    expect(job?.company).toBe('Cosmo Labs');
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

  it('confirms applied when the JD CTA shows Applied', () => {
    const adapter = new NaukriAdapter();
    Object.defineProperty(document, 'location', {
      value: { href: 'https://www.naukri.com/job-listings-123' },
      configurable: true,
    });
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Software Engineer</h1>
        <button type="button" class="styles_apply-button__uJI3A">Applied</button>
      </div>
    `;
    expect(adapter.detectApplicationStatus(document)).toBe('applied');
  });

  it('does not treat a plain Apply button as applied', () => {
    const adapter = new NaukriAdapter();
    Object.defineProperty(document, 'location', {
      value: { href: 'https://www.naukri.com/job-listings-456' },
      configurable: true,
    });
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Software Engineer</h1>
        <button type="button" class="styles_apply-button__uJI3A">Apply</button>
      </div>
    `;
    expect(adapter.detectApplicationStatus(document)).toBeNull();
  });

  it('treats Login/Register header as logged out', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <a id="login_Layer" class="nI-gNb-lg-rg__login" href="/login">Login</a>
      <a id="register_Layer" class="nI-gNb-lg-rg__register" href="/register">Register</a>
    `;
    document.cookie = 'naukri=1';
    expect(adapter.isLoggedIn(document)).toBe(false);
    expect(adapter.getLoginStatus(document)).toBe('loggedOut');
  });

  it('treats #login_Layer alone (without Login control class) as uncertain', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `<a id="login_Layer" href="/login" style="display:none">Login</a>`;
    expect(adapter.getLoginStatus(document)).toBe('uncertain');
    expect(adapter.isLoggedIn(document)).toBe(false);
  });

  it('treats empty header with no signals as uncertain', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `<header class="nI-gNb-header"><div></div></header>`;
    expect(adapter.getLoginStatus(document)).toBe('uncertain');
  });

  it('treats profile drawer as logged in', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `<div class="nI-gNb-drawer__icon"></div>`;
    expect(adapter.isLoggedIn(document)).toBe(true);
    expect(adapter.getLoginStatus(document)).toBe('loggedIn');
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

  it('detects soft session cookie hint without flipping login status', () => {
    document.cookie = 'naukri_session=abc; other=1';
    expect(hasNaukriSessionCookieHint(document.cookie)).toBe(true);
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `<div></div>`;
    expect(adapter.getLoginStatus(document)).toBe('uncertain');
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

  it('finds the visible Easy Apply button on job detail pages', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <div class="jd-header">
        <h1 class="jd-header-title">Software Engineer</h1>
        <div class="jd-header-comp-name"><a>Acme</a></div>
        <button type="button" class="styles_apply-button__uJI3A">Apply</button>
        <button type="button">Save</button>
      </div>
    `;
    const btn = adapter.findEasyApplyButton(document);
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim()).toBe('Apply');
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
  it('builds a naukri search URL from the primary job title', () => {
    const url = buildNaukriSearchUrl({
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer', 'Full Stack Developer'],
      keywords: ['React', 'Node'],
      locations: ['Bengaluru'],
    });
    expect(url).toContain('naukri.com');
    expect(url).toContain('k=Software+Engineer');
    expect(url).not.toContain('React');
    expect(url).toContain('Bengaluru');
    expect(url).toContain('software-engineer-jobs-in-bengaluru');
  });

  it('plans all title × city combinations plus skill and nationwide fallbacks', () => {
    const plan = buildNaukriSearchQueryPlan({
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer', 'Full Stack Developer', 'UI Design'],
      keywords: ['React', 'Node'],
      locations: ['Hyderabad', 'Bangalore'],
    });
    // At least every title × city (3×2=6), plus combos/skills/nationwide.
    expect(plan.length).toBeGreaterThanOrEqual(6);
    const titleCity = plan.filter((p) => p.kind === 'title');
    expect(titleCity.length).toBeGreaterThanOrEqual(6);
    expect(
      titleCity.some(
        (p) =>
          p.title === 'Full Stack Developer' && p.location === 'Hyderabad'
      )
    ).toBe(true);
    expect(
      titleCity.some(
        (p) => p.title === 'UI Design' && p.location === 'Bangalore'
      )
    ).toBe(true);
    expect(plan.some((p) => p.kind === 'title_keyword')).toBe(true);
    expect(plan.some((p) => p.kind === 'keyword')).toBe(true);
    expect(plan.some((p) => p.kind === 'nationwide' && !p.location)).toBe(
      true
    );
    // URLs unique
    expect(new Set(plan.map((p) => p.url)).size).toBe(plan.length);
  });

  it('falls back to keywords when titles are empty', () => {
    const url = buildNaukriSearchUrl({
      ...DEFAULT_JOB_PREFERENCES,
      titles: [],
      keywords: ['React', 'Node', 'TypeScript'],
      locations: [],
    });
    expect(url).toContain('k=React+Node');
    expect(url).not.toContain('TypeScript');
  });

  it('adds Naukri ctcFilter buckets for min salary', () => {
    const url = buildNaukriSearchUrl({
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer'],
      minSalaryLpa: 10,
    });
    expect(url).toContain('ctcFilter=10to15');
    expect(url).toContain('ctcFilter=15to25');
    expect(url).not.toContain('ctcFilter=0to3');
    expect(ctcFiltersForMinSalary(10)).toEqual([
      '10to15',
      '15to25',
      '25to50',
      '50to75',
      '75to100',
      '100to500',
    ]);
  });

  it('adds wfhType for work mode preferences', () => {
    expect(
      buildNaukriSearchUrl({
        ...DEFAULT_JOB_PREFERENCES,
        titles: ['Dev'],
        workMode: 'remote',
      })
    ).toContain('wfhType=2');
    expect(
      buildNaukriSearchUrl({
        ...DEFAULT_JOB_PREFERENCES,
        titles: ['Dev'],
        workMode: 'hybrid',
      })
    ).toContain('wfhType=3');
    expect(
      buildNaukriSearchUrl({
        ...DEFAULT_JOB_PREFERENCES,
        titles: ['Dev'],
        workMode: 'office',
      })
    ).toContain('wfhType=0');
    expect(
      buildNaukriSearchUrl({
        ...DEFAULT_JOB_PREFERENCES,
        titles: ['Dev'],
        workMode: 'any',
      })
    ).not.toContain('wfhType');
    expect(wfhTypeForWorkMode('remote')).toBe('2');
    expect(workModeFilterLabel('remote')).toBe('Remote');
    expect(workModeFilterLabel('office')).toBe('Work from office');
    expect(workModeFilterLabel('any')).toBeNull();
    expect(salaryBucketLabelsForMin(10)).toEqual([
      '10-15 Lakhs',
      '15-25 Lakhs',
      '25-50 Lakhs',
      '50-75 Lakhs',
      '75-100 Lakhs',
      '100+ Lakhs',
    ]);
  });

  it('detects when search URL is missing preference filters', () => {
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      minSalaryLpa: 10,
      workMode: 'remote' as const,
    };
    expect(
      searchUrlHasPreferenceFilters(
        'https://www.naukri.com/dev-jobs?k=Dev',
        prefs
      )
    ).toBe(false);
    expect(
      searchUrlHasPreferenceFilters(
        'https://www.naukri.com/dev-jobs?k=Dev&ctcFilter=10to15&wfhType=2',
        prefs
      )
    ).toBe(true);
  });

  it('does not treat missing sidebar as already filtered', () => {
    document.body.innerHTML = `<main><input placeholder="Search jobs" /></main>`;
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      minSalaryLpa: 10,
      workMode: 'remote' as const,
    };
    expect(preferenceFiltersAlreadyApplied(document, prefs)).toBe(false);
    const result = applyPreferenceFilters(document, prefs);
    expect(result.ready).toBe(false);
  });

  it('clicks All Filters salary, location, and work mode checkboxes from prefs', () => {
    document.body.innerHTML = `
      <aside>
        <button type="button">All Filters</button>
        <div class="styles_filterContainer__x">
          <div class="styles_filterHeading__x"><span>Work mode</span></div>
          <div class="styles_filterOptns__x" data-filter-id="wfhType">
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Work from office-wfhType-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Work from office-wfhType-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Work from office">Work from office</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Remote-wfhType-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Remote-wfhType-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Remote">Remote</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Hybrid-wfhType-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Hybrid-wfhType-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Hybrid">Hybrid</span>
              </label>
            </div>
          </div>
        </div>
        <div class="styles_filterContainer__x">
          <div class="styles_filterHeading__x"><span>Location</span></div>
          <div class="styles_filterOptns__x" data-filter-id="citiesGid">
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Hyderabad/Secunderabad-cityTypeGid-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Hyderabad/Secunderabad-cityTypeGid-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Hyderabad/Secunderabad">Hyderabad/Secunderabad</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Bengaluru-cityTypeGid-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Bengaluru-cityTypeGid-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Bengaluru">Bengaluru</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Chennai-cityTypeGid-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Chennai-cityTypeGid-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Chennai">Chennai</span>
              </label>
            </div>
          </div>
        </div>
        <div class="styles_filterContainer__x">
          <div class="styles_filterHeading__x"><span>Salary</span></div>
          <div class="styles_filterOptns__x" data-filter-id="salaryRange">
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-3-6 Lakhs-ctcFilter-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-3-6 Lakhs-ctcFilter-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="3-6 Lakhs">3-6 Lakhs</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-10-15 Lakhs-ctcFilter-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-10-15 Lakhs-ctcFilter-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="10-15 Lakhs">10-15 Lakhs</span>
              </label>
            </div>
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-15-25 Lakhs-ctcFilter-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-15-25 Lakhs-ctcFilter-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="15-25 Lakhs">15-25 Lakhs</span>
              </label>
            </div>
          </div>
        </div>
        <div class="styles_filterContainer__x">
          <div class="styles_filterHeading__x"><span>Department</span></div>
          <div class="styles_filterOptns__x" data-filter-id="department">
            <div class="styles_chckBoxCont__x">
              <input class="styles_inputCheckbox__x" id="chk-Engineering - Software & QA-functionAreaIdGid-" type="checkbox" style="display:none" />
              <label class="styles_chkLbl__x" for="chk-Engineering - Software & QA-functionAreaIdGid-">
                <i class="ni-icon-unchecked"></i>
                <span class="styles_filterLabel__x" title="Engineering - Software & QA">Engineering - Software & QA</span>
              </label>
            </div>
          </div>
        </div>
        <div>Remote jobs</div>
      </aside>
    `;

    Object.defineProperty(document, 'location', {
      value: {
        href: 'https://www.naukri.com/software-engineer-jobs-in-hyderabad?k=Software+Engineer&l=Hyderabad&ctcFilter=10to15&wfhType=2',
      },
      configurable: true,
    });

    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      minSalaryLpa: 10,
      workMode: 'remote' as const,
      locations: ['Hyderabad', 'Bangalore', 'Chennai'],
    };

    expect(preferenceFiltersAlreadyApplied(document, prefs)).toBe(false);
    const result = applyPreferenceFilters(document, prefs, {
      focusLocation: 'Hyderabad',
    });
    expect(result.ok).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.confirmed).toBe(true);
    expect(result.applied.some((a) => a.includes('10-15 Lakhs'))).toBe(true);
    expect(result.applied.some((a) => a.includes('Remote'))).toBe(true);
    expect(result.applied.some((a) => /Hyderabad/i.test(a))).toBe(true);
    expect(result.applied.some((a) => /Engineering/i.test(a))).toBe(false);

    expect(
      (document.getElementById('chk-10-15 Lakhs-ctcFilter-') as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (document.getElementById('chk-Remote-wfhType-') as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (
        document.getElementById(
          'chk-Hyderabad/Secunderabad-cityTypeGid-'
        ) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(
      (
        document.getElementById(
          'chk-Engineering - Software & QA-functionAreaIdGid-'
        ) as HTMLInputElement
      ).checked
    ).toBe(false);
    expect(preferenceFiltersAlreadyApplied(document, prefs, 'Hyderabad')).toBe(
      true
    );
  });

  it('reconfirms location via search URL when sidebar city is missing', () => {
    document.body.innerHTML = `
      <aside>
        <button type="button">All Filters</button>
        <div class="styles_filterOptns__x" data-filter-id="salaryRange">
          <div class="styles_chckBoxCont__x">
            <input id="chk-10-15 Lakhs-ctcFilter-" type="checkbox" checked style="display:none" />
            <label for="chk-10-15 Lakhs-ctcFilter-">
              <i class="ni-icon-checked"></i>
              <span title="10-15 Lakhs">10-15 Lakhs</span>
            </label>
          </div>
        </div>
      </aside>
    `;
    Object.defineProperty(document, 'location', {
      value: {
        href: 'https://www.naukri.com/software-engineer-jobs-in-chennai?k=Software+Engineer&l=Chennai&ctcFilter=10to15',
      },
      configurable: true,
    });
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      minSalaryLpa: 10,
      workMode: 'any' as const,
      locations: ['Chennai'],
    };
    expect(preferenceFiltersAlreadyApplied(document, prefs)).toBe(true);
    expect(
      searchUrlHasPreferenceFilters(
        'https://www.naukri.com/software-engineer-jobs-in-chennai?k=Software+Engineer&l=Chennai&ctcFilter=10to15',
        prefs
      )
    ).toBe(true);
  });

  it('strictly enforces disclosed salary then title/keywords', () => {
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer'],
      keywords: ['React'],
      minSalaryLpa: 10,
    };
    expect(
      matchesPreferences(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-1',
          salaryText: '3-6 Lacs PA',
          skills: ['React'],
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-2',
          salaryText: 'Not Disclosed',
          skills: ['React'],
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-3',
          skills: ['React'],
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-4',
          salaryText: '10-15 LPA',
          skills: ['Java'],
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Marketing Manager',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-5',
          salaryText: '10-15 LPA',
          skills: ['React'],
        },
        prefs
      )
    ).toBe(false);
    expect(
      matchesPreferences(
        {
          title: 'Senior Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-6',
          salaryText: '10-15 LPA',
          skills: ['React'],
        },
        prefs
      )
    ).toBe(true);
    expect(salaryMeetsMinimum('12 LPA', 10)).toBe(true);
    expect(salaryMeetsMinimum('8-9 Lacs', 10)).toBe(false);
  });

  it('returns specific skip reasons for preference failures', () => {
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Software Engineer'],
      keywords: ['React'],
      minSalaryLpa: 10,
      experienceMin: 2,
      experienceMax: 5,
    };
    expect(
      preferenceSkipReason(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-1',
          experienceText: '0-1 Yrs',
          salaryText: '12 LPA',
          skills: ['React'],
        },
        prefs
      )
    ).toMatch(/Experience/i);
    expect(
      preferenceSkipReason(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-2',
          experienceText: '3-4 Yrs',
          salaryText: 'Not Disclosed',
          skills: ['React'],
        },
        prefs
      )
    ).toMatch(/Salary not disclosed/i);
    expect(
      preferenceSkipReason(
        {
          title: 'Marketing Manager',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-3',
          experienceText: '3-4 Yrs',
          salaryText: '12 LPA',
          skills: ['React'],
        },
        prefs
      )
    ).toMatch(/title/i);
    expect(
      preferenceSkipReason(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-4',
          experienceText: '3-4 Yrs',
          salaryText: '12 LPA',
          skills: ['Java'],
        },
        prefs
      )
    ).toMatch(/Keywords/i);
    expect(
      preferenceSkipReason(
        {
          title: 'Software Engineer',
          company: 'Acme',
          url: 'https://www.naukri.com/job-listings-5',
          experienceText: '3-4 Yrs',
          salaryText: '12 LPA',
          skills: ['React'],
        },
        prefs
      )
    ).toBeNull();
  });

  it('filters by experience range', () => {
    const prefs = {
      ...DEFAULT_JOB_PREFERENCES,
      titles: ['Dev'],
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
          salaryText: '10-12 LPA',
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
          salaryText: '10-12 LPA',
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
