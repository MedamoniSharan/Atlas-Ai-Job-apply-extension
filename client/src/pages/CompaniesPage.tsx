import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import type { CompanySummary } from '@cosmo/shared';
import { isUsableCompanyLogo, sanitizeAboutCompany } from '@cosmo/shared';
import { fetchCompanies } from '../lib/api';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { CosmosLoader } from '../components/CosmosLogo';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { breadcrumbJsonLd, webPageJsonLd } from '../lib/jsonLd';
import type { ShellOutletContext } from '../App';
import '../styles/landing-fonts.css';

const PAGE_DESCRIPTION =
  'Browse companies hiring across Cosmo job scans. Log in to open roles and apply with the Naukri co-pilot.';

const GUEST_LOGIN_HREF = '/login?next=%2Fdashboard';

function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function usableLogo(url?: string): string | undefined {
  return isUsableCompanyLogo(url) ? url!.trim() : undefined;
}

function companyPath(key: string): string {
  return `/companies/${encodeURIComponent(key)}`;
}

function CompanyLogo({
  name,
  logo,
  size = 'md',
}: {
  name: string;
  logo?: string;
  size?: 'md' | 'sm';
}) {
  const [failed, setFailed] = useState(false);
  const src = usableLogo(logo);
  const cls =
    size === 'sm' ? 'companies-logo companies-logo--sm' : 'companies-logo';
  if (!src || failed) {
    return (
      <div className={`${cls} companies-logo--fallback`} aria-hidden>
        {companyInitials(name)}
      </div>
    );
  }
  return (
    <img
      className={cls}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function CompanyListingCard({
  company,
  href,
  loginHint,
}: {
  company: CompanySummary;
  href: string;
  loginHint?: boolean;
}) {
  const about =
    sanitizeAboutCompany(company.aboutCompany, { maxLen: 220 }) ||
    'Opportunities discovered across Cosmo users.';
  const countLabel = `${company.opportunityCount} opportunit${
    company.opportunityCount === 1 ? 'y' : 'ies'
  }`;
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = usableLogo(company.companyLogo);

  return (
    <article
      className="job-card companies-listing-card"
      aria-label={`Company listing for ${company.name}`}
    >
      <header className="job-header">
        <div className="job-heading">
          <Link className="job-title" to={href}>
            <span>{company.name}</span>
          </Link>
          <p className="company-line">
            <span className="companies-listing-card__count">{countLabel}</span>
            {loginHint ? (
              <span className="companies-listing-card__login-hint">
                Log in to view jobs
              </span>
            ) : null}
          </p>
        </div>
        <div className="job-actions">
          <Link
            className="logo-button"
            to={href}
            title={
              loginHint
                ? `Log in to view jobs from ${company.name}`
                : `View jobs from ${company.name}`
            }
            aria-label={
              loginHint
                ? `Log in to view jobs from ${company.name}`
                : `View jobs from ${company.name}`
            }
          >
            {logo && !logoFailed ? (
              <img
                className="company-logo"
                src={logo}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="company-logo company-logo--fallback" aria-hidden>
                {companyInitials(company.name).slice(0, 1)}
              </span>
            )}
          </Link>
        </div>
      </header>

      <section className="job-content">
        <Link
          className="description-button"
          to={href}
          aria-label={`About ${company.name}`}
        >
          <FileText size={15} aria-hidden="true" />
          <span>{about}</span>
        </Link>
      </section>

      <footer className="job-footer">
        <div className="footer-actions">
          <Link
            className="companies-listing-card__arrow"
            to={href}
            aria-label={
              loginHint
                ? `Log in to view jobs from ${company.name}`
                : `View jobs from ${company.name}`
            }
          >
            <ArrowRight size={16} strokeWidth={2.2} aria-hidden />
          </Link>
        </div>
      </footer>
    </article>
  );
}

function TopCompaniesRail({
  companies,
  hrefFor,
}: {
  companies: CompanySummary[];
  hrefFor: (company: CompanySummary) => string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(max > 4 && el.scrollLeft < max - 4);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [companies]);

  function scrollByCards(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.75, 320);
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  if (!companies.length) return null;

  return (
    <section className="companies-rail" aria-label="Top companies">
      <div className="companies-rail__head">
        <p className="companies-rail__label">
          Explore openings from top companies and startups.
        </p>
        {canScrollLeft || canScrollRight ? (
          <div className="companies-rail__controls">
            <button
              type="button"
              className="companies-rail__nav"
              aria-label="Scroll companies left"
              disabled={!canScrollLeft}
              onClick={() => scrollByCards(-1)}
            >
              <ChevronLeft size={18} strokeWidth={2.1} aria-hidden />
            </button>
            <button
              type="button"
              className="companies-rail__nav"
              aria-label="Scroll companies right"
              disabled={!canScrollRight}
              onClick={() => scrollByCards(1)}
            >
              <ChevronRight size={18} strokeWidth={2.1} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      <div className="companies-rail__scroller" ref={scrollerRef} tabIndex={0}>
        <div className="companies-rail__track">
          {companies.map((company) => (
            <Link
              key={`rail-${company.key}`}
              to={hrefFor(company)}
              className="companies-rail__card"
            >
              <CompanyLogo
                name={company.name}
                logo={company.companyLogo}
                size="sm"
              />
              <div className="companies-rail__text">
                <span className="companies-rail__name">{company.name}</span>
                <span className="companies-rail__count">
                  {company.opportunityCount} job
                  {company.opportunityCount === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function CompaniesGrid({
  q,
  page,
  setPage,
  hrefFor,
  loginHint,
}: {
  q: string;
  page: number;
  setPage: (page: number | ((prev: number) => number)) => void;
  hrefFor: (company: CompanySummary) => string;
  loginHint?: boolean;
}) {
  const featuredQuery = useQuery({
    queryKey: ['companies', 'featured-rail'],
    queryFn: async () => {
      const res = await fetchCompanies({ page: 1, limit: 24 });
      if (!res.success) {
        throw new Error(res.message || 'Failed to load companies');
      }
      return res.data;
    },
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ['companies', q, page],
    queryFn: async () => {
      const res = await fetchCompanies({ page, limit: 24, q });
      if (!res.success) {
        throw new Error(res.message || 'Failed to load companies');
      }
      return res.data;
    },
  });

  const railCompanies = useMemo(() => {
    const items = featuredQuery.data?.items ?? [];
    const withLogo = items.filter((c) =>
      isUsableCompanyLogo(c.companyLogo)
    );
    return (withLogo.length ? withLogo : items).slice(0, 20);
  }, [featuredQuery.data?.items]);

  const totalLabel = useMemo(() => {
    const total = query.data?.total ?? featuredQuery.data?.total ?? 0;
    if (!total) return 'Explore companies hiring across Cosmo scans.';
    return `Explore ${total} distinct compan${total === 1 ? 'y' : 'ies'} from jobs scanned across Cosmo.`;
  }, [query.data?.total, featuredQuery.data?.total]);

  const pages = query.data?.totalPages ?? 0;

  return (
    <>
      <p className="companies-hero__sub companies-hero__sub--alone">{totalLabel}</p>

      {railCompanies.length > 0 ? (
        <TopCompaniesRail companies={railCompanies} hrefFor={hrefFor} />
      ) : null}

      {query.isLoading ? (
        <div className="companies-state">
          <CosmosLoader size={36} />
          <p>Loading companies…</p>
        </div>
      ) : query.isError ? (
        <div className="companies-state">
          <Building2 size={28} strokeWidth={1.6} />
          <p>{(query.error as Error).message}</p>
        </div>
      ) : !query.data?.items.length ? (
        <div className="companies-state">
          <Building2 size={28} strokeWidth={1.6} />
          <p>
            No companies yet. Scan and match jobs with Cosmo to fill this
            catalog.
          </p>
        </div>
      ) : (
        <>
          <div className="companies-grid">
            {query.data.items.map((company) => (
              <CompanyListingCard
                key={company.key}
                company={company}
                href={hrefFor(company)}
                loginHint={loginHint}
              />
            ))}
          </div>

          {pages > 1 ? (
            <nav className="companies-pager" aria-label="Companies pages">
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let n = i + 1;
                if (pages > 7) {
                  const windowStart = Math.max(
                    1,
                    Math.min(page - 3, pages - 6)
                  );
                  n = windowStart + i;
                }
                return (
                  <button
                    key={n}
                    type="button"
                    className={
                      n === page
                        ? 'companies-pager__btn is-active'
                        : 'companies-pager__btn'
                    }
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                );
              })}
              {page < pages ? (
                <button
                  type="button"
                  className="companies-pager__btn"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  Next ›
                </button>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

/** Logged-in companies catalog inside the app shell. */
export function CompaniesPage() {
  const { search: shellSearch } = useOutletContext<ShellOutletContext>();
  const [q, setQ] = useState(shellSearch);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setQ(shellSearch);
    setPage(1);
  }, [shellSearch]);

  return (
    <div className="companies-page">
      <CompaniesGrid
        q={q}
        page={page}
        setPage={setPage}
        hrefFor={(company) => companyPath(company.key)}
      />
    </div>
  );
}

/** Guest companies browse from the marketing navbar. */
export function PublicCompaniesPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setQ(draft.trim());
  }

  /** Guests only see page 1; any further page request goes to login. */
  function requestPage(
    next: number | ((prev: number) => number)
  ) {
    const page = typeof next === 'function' ? next(1) : next;
    if (page > 1) {
      navigate(GUEST_LOGIN_HREF);
      return;
    }
  }

  return (
    <div className="landing companies-public">
      <SeoHead
        title="Companies hiring"
        description={PAGE_DESCRIPTION}
        path="/companies"
        jsonLd={[
          webPageJsonLd({
            name: 'Companies hiring — Cosmo',
            description: PAGE_DESCRIPTION,
            path: '/companies',
          }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Companies', path: '/companies' },
          ]),
        ]}
      />
      <LandingNavbar />

      <main className="companies-public__main">
        <div className="companies-page">
          <header className="companies-hero">
            <h1 className="companies-hero__title">Companies</h1>
          </header>

          <form
            className="companies-search companies-search--wide"
            onSubmit={submitSearch}
          >
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Search companies…"
              aria-label="Search companies"
            />
          </form>

          <CompaniesGrid
            q={q}
            page={1}
            setPage={requestPage}
            hrefFor={() => GUEST_LOGIN_HREF}
            loginHint
          />
        </div>
      </main>

      <CosmosDreamFooter />
    </div>
  );
}
