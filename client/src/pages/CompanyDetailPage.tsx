import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  Ellipsis,
  FileText,
  LayoutGrid,
  List,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import type { CompanyJob } from '@cosmo/shared';
import { isUsableCompanyLogo, sanitizeAboutCompany } from '@cosmo/shared';
import { fetchCompanyJobs } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

const SAVED_JOBS_KEY = 'cosmo_saved_catalog_jobs';
const APPLIED_JOBS_KEY = 'cosmo_applied_catalog_jobs';
const VIEW_MODE_KEY = 'cosmo_company_jobs_view';

type ViewMode = 'list' | 'grid';

function readStoredViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === 'list' || raw === 'grid') return raw;
  } catch {
    /* ignore */
  }
  return 'grid';
}

function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function usableLogo(url?: string): string | undefined {
  return isUsableCompanyLogo(url) ? url!.trim() : undefined;
}

function CompanyLogo({
  name,
  logo,
  size = 'md',
}: {
  name: string;
  logo?: string;
  size?: 'md' | 'sm' | 'hero';
}) {
  const [failed, setFailed] = useState(false);
  const src = usableLogo(logo);
  const cls =
    size === 'sm'
      ? 'companies-logo companies-logo--sm'
      : size === 'hero'
        ? 'companies-logo companies-logo--hero'
        : 'companies-logo companies-logo--lg';
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

function readIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function jobDescription(job: CompanyJob): string {
  return (
    job.description?.trim() ||
    job.snippet?.trim() ||
    'No description available for this role yet.'
  );
}

function postedLabel(postedAt?: string): string | null {
  if (!postedAt) return null;
  return /^posted\b/i.test(postedAt) ? postedAt : `Posted ${postedAt}`;
}

function JobListingCard({
  job,
  companyLogo,
  companyKey,
  saved,
  applied,
  onToggleSave,
  onMarkApplied,
}: {
  job: CompanyJob;
  companyLogo?: string;
  companyKey: string;
  saved: boolean;
  applied: boolean;
  onToggleSave: (id: string) => void;
  onMarkApplied: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const description = jobDescription(job);
  const posted = postedLabel(job.postedAt);
  const category =
    job.role || job.department || job.industry || job.employmentType;
  const logo = usableLogo(job.companyLogo || companyLogo);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!detailsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDetailsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailsOpen]);

  function handleApply() {
    onMarkApplied(job.id);
    if (job.url) {
      window.open(job.url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <article
      className="job-card"
      aria-label={`Job listing for ${job.title}`}
    >
      <header className="job-header">
        <div className="job-heading">
          <button
            className="job-title"
            type="button"
            onClick={() => setDetailsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={detailsOpen}
          >
            <span>{job.title}</span>
          </button>
          <p className="company-line">
            <Link
              className="company-button"
              to={`/companies/${encodeURIComponent(companyKey)}`}
              title={`More jobs from ${job.company}`}
            >
              {job.company}
            </Link>
          </p>
        </div>
        <div className="job-actions">
          <button
            className="logo-button"
            type="button"
            title={`More jobs from ${job.company}`}
            aria-label={`View more jobs from ${job.company}`}
            onClick={() => setDetailsOpen(true)}
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
                {companyInitials(job.company).slice(0, 1)}
              </span>
            )}
          </button>
          <div className="menu-wrap" ref={menuRef}>
            <button
              className="icon-button"
              type="button"
              aria-label={`More job options for ${job.company}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Ellipsis size={18} />
            </button>
            {menuOpen ? (
              <div className="menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleSave(job.id);
                    setMenuOpen(false);
                  }}
                >
                  {saved ? 'Unsave job' : 'Save job'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setDetailsOpen(true);
                  }}
                >
                  View details
                </button>
                {job.url ? (
                  <a
                    role="menuitem"
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                  >
                    Open listing
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="job-content">
        {job.location ? (
          <div className="meta-row">
            <span className="meta-item">
              <MapPin size={15} aria-hidden="true" />
              <span>{job.location}</span>
            </span>
          </div>
        ) : null}
        <button
          className="description-button"
          type="button"
          onClick={() => setDetailsOpen(true)}
          aria-label="View full job details"
        >
          <FileText size={15} aria-hidden="true" />
          <span>{description}</span>
        </button>
        <div className="tag-row" aria-label="Job metadata">
          {category ? <span>{category}</span> : null}
          {category && job.salary ? (
            <span className="dot" aria-hidden="true">
              •
            </span>
          ) : null}
          {job.salary ? <span>{job.salary}</span> : null}
          {(category || job.salary) && posted ? (
            <span className="dot" aria-hidden="true">
              •
            </span>
          ) : null}
          {posted ? <span title={job.postedAt}>{posted}</span> : null}
        </div>
      </section>

      <footer className="job-footer">
        <div className="footer-actions">
          <button
            className={`apply-button ${applied ? 'applied' : ''}`}
            type="button"
            disabled={!job.url && !applied}
            onClick={handleApply}
          >
            <span>{applied ? 'Application started' : 'Apply now'}</span>
            {applied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <ArrowRight size={16} aria-hidden="true" />
            )}
          </button>
          <button
            className={`save-button ${saved ? 'saved' : ''}`}
            type="button"
            aria-label={saved ? 'Job saved' : 'Save'}
            aria-pressed={saved}
            onClick={() => onToggleSave(job.id)}
          >
            <Bookmark
              size={16}
              fill={saved ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </footer>

      {detailsOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setDetailsOpen(false)}
        >
          <section
            className="details-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`details-title-${job.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-head">
              <h2 id={`details-title-${job.id}`}>{job.title}</h2>
              <button
                className="dialog-close"
                type="button"
                aria-label="Close job details"
                onClick={() => setDetailsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="dialog-company">
              {job.company}
              {job.location ? ` · ${job.location}` : ''}
            </p>
            <p className="dialog-copy">{description}</p>
            <button
              className="apply-button dialog-apply"
              type="button"
              disabled={!job.url && !applied}
              onClick={() => {
                handleApply();
                setDetailsOpen(false);
              }}
            >
              <span>{applied ? 'Application started' : 'Apply now'}</span>
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      ) : null}
    </article>
  );
}

export function CompanyDetailPage() {
  const { companyKey: rawKey } = useParams();
  const companyKey = rawKey ? decodeURIComponent(rawKey) : '';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>(() => readStoredViewMode());
  const [savedIds, setSavedIds] = useState<Set<string>>(() =>
    readIdSet(SAVED_JOBS_KEY)
  );
  const [appliedIds, setAppliedIds] = useState<Set<string>>(() =>
    readIdSet(APPLIED_JOBS_KEY)
  );

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const query = useQuery({
    queryKey: ['company-jobs', companyKey, q, page],
    enabled: Boolean(companyKey),
    queryFn: async () => {
      const res = await fetchCompanyJobs(companyKey, {
        page,
        limit: 24,
        q,
      });
      if (!res.success) throw new Error(res.message || 'Failed to load jobs');
      return res.data;
    },
  });

  const company = query.data?.company;
  const pages = query.data?.totalPages ?? 0;

  const subtitle = useMemo(() => {
    if (!company) return '';
    return (
      sanitizeAboutCompany(company.aboutCompany, {
        maxLen: 4000,
        maxSentences: 16,
      }) ||
      `${company.opportunityCount} opportunit${
        company.opportunityCount === 1 ? 'y' : 'ies'
      } scanned across Cosmo.`
    );
  }, [company]);

  function toggleSave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeIdSet(SAVED_JOBS_KEY, next);
      return next;
    });
  }

  function markApplied(id: string) {
    setAppliedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeIdSet(APPLIED_JOBS_KEY, next);
      return next;
    });
  }

  if (!companyKey) {
    return (
      <div className="companies-state">
        <p>Missing company.</p>
        <Link to="/companies">Back to companies</Link>
      </div>
    );
  }

  return (
    <div className="companies-page companies-page--detail">
      <Link to="/companies" className="companies-back">
        <ArrowLeft size={16} strokeWidth={2} />
        Companies
      </Link>

      {query.isLoading ? (
        <div className="companies-state">
          <CosmosLoader size={36} />
          <p>Loading company…</p>
        </div>
      ) : query.isError ? (
        <div className="companies-state">
          <Building2 size={28} strokeWidth={1.6} />
          <p>{(query.error as Error).message}</p>
          <Link to="/companies">Back to companies</Link>
        </div>
      ) : !company ? (
        <div className="companies-state">
          <p>Company not found.</p>
          <Link to="/companies">Back to companies</Link>
        </div>
      ) : (
        <>
          <header className="company-detail-hero">
            <div className="company-detail-hero__text">
              <h1 className="company-detail-hero__title">{company.name}</h1>
              <p className="company-detail-hero__sub">{subtitle}</p>
            </div>
            <CompanyLogo
              name={company.name}
              logo={company.companyLogo}
              size="hero"
            />
          </header>

          <label className="companies-search companies-search--wide">
            <Search size={16} strokeWidth={1.9} aria-hidden />
            <input
              type="search"
              placeholder="Search jobs…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <div className="company-detail-toolbar">
            <div className="company-detail-tabs" role="tablist">
              <span className="company-detail-tabs__tab is-active" role="tab">
                Jobs ({company.opportunityCount})
              </span>
            </div>
            <div
              className="dash-view-toggle"
              role="group"
              aria-label="Job listing view"
            >
              <button
                type="button"
                className={`dash-view-toggle__btn${viewMode === 'list' ? ' is-active' : ''}`}
                aria-pressed={viewMode === 'list'}
                title="List view"
                onClick={() => setViewMode('list')}
              >
                <List size={16} strokeWidth={2.2} aria-hidden />
                <span>List</span>
              </button>
              <button
                type="button"
                className={`dash-view-toggle__btn${viewMode === 'grid' ? ' is-active' : ''}`}
                aria-pressed={viewMode === 'grid'}
                title="Grid view"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={16} strokeWidth={2.2} aria-hidden />
                <span>Grid</span>
              </button>
            </div>
          </div>

          {!query.data?.items.length ? (
            <div className="companies-state">
              <p>No jobs match this search.</p>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid' ? 'job-card-grid' : 'job-card-list'
              }
            >
              {query.data.items.map((job) => (
                <JobListingCard
                  key={job.id}
                  job={job}
                  companyLogo={company.companyLogo}
                  companyKey={companyKey}
                  saved={savedIds.has(job.id)}
                  applied={appliedIds.has(job.id)}
                  onToggleSave={toggleSave}
                  onMarkApplied={markApplied}
                />
              ))}
            </div>
          )}

          {pages > 1 ? (
            <nav className="companies-pager" aria-label="Job pages">
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
    </div>
  );
}
