import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@atlas/shared';
import { fetchApplications } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { ExtensionOnboarding } from '../components/ExtensionOnboarding';
import { useAuthStore } from '../store/authStore';

type ViewMode = 'table' | 'grid';
type Bucket = 'all' | 'matched' | 'applied' | 'skipped';
type SourceFilter = 'all' | 'manual' | 'auto_scan' | 'auto_apply';

const PAGE_SIZES = [6, 12, 24, 48] as const;
const VIEW_KEY = 'atlas.applications.view';

function sourceLabel(app: Application): string {
  if (app.metadata?.skipped) return 'Skipped';
  if (app.status === 'applied') return 'Applied';
  if (app.metadata?.source === 'auto_scan') return 'Matched';
  if (app.metadata?.source === 'auto_apply') return 'Applied';
  return app.status;
}

function sourceBadgeClass(app: Application): string {
  const label = sourceLabel(app).toLowerCase();
  if (label === 'applied') return 'app-badge app-badge--applied';
  if (label === 'skipped') return 'app-badge app-badge--skipped';
  if (label === 'matched' || label === 'detected') {
    return 'app-badge app-badge--matched';
  }
  return 'app-badge';
}

function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function CompanyLogo({
  app,
  size = 'md',
}: {
  app: Application;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const cls =
    size === 'sm'
      ? 'app-card__logo app-card__logo--sm'
      : 'app-card__logo';

  if (!app.companyLogo || failed) {
    return (
      <div
        className={`${cls} app-card__logo--fallback`}
        aria-hidden
      >
        {companyInitials(app.company)}
      </div>
    );
  }
  return (
    <img
      className={cls}
      src={app.companyLogo}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function ApplicationCard({ app }: { app: Application }) {
  const when = new Date(app.appliedAt ?? app.createdAt).toLocaleString();

  return (
    <article className="app-card app-card--grid">
      <CompanyLogo app={app} />
      <div className="app-card__body">
        <div className="app-card__top">
          <div className="app-card__titles">
            <h3 className="app-card__title">
              {app.url ? (
                <a href={app.url} target="_blank" rel="noreferrer">
                  {app.title}
                </a>
              ) : (
                app.title
              )}
            </h3>
            <p className="app-card__company">{app.company}</p>
          </div>
          <span className={sourceBadgeClass(app)}>{sourceLabel(app)}</span>
        </div>

        <ul className="app-card__meta">
          {app.experience ? (
            <li>
              <span className="app-card__icon" aria-hidden>
                Exp
              </span>
              {app.experience}
            </li>
          ) : null}
          {app.salary ? (
            <li>
              <span className="app-card__icon" aria-hidden>
                ₹
              </span>
              {app.salary}
            </li>
          ) : null}
          {app.location ? <li>{app.location}</li> : null}
          {app.rating ? <li>{app.rating}★</li> : null}
        </ul>

        {app.description ? (
          <p className="app-card__desc">{app.description}</p>
        ) : null}

        {app.skills && app.skills.length > 0 ? (
          <ul className="app-card__skills">
            {app.skills.slice(0, 8).map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        ) : null}

        {app.metadata?.skipReason ? (
          <p className="app-card__skip">{app.metadata.skipReason}</p>
        ) : null}

        <div className="app-card__foot">
          <span className="app-card__platform">{app.platform}</span>
          <time dateTime={app.appliedAt ?? app.createdAt}>{when}</time>
        </div>
      </div>
    </article>
  );
}

function ApplicationsTable({ items }: { items: Application[] }) {
  return (
    <div className="apps-table-wrap">
      <table className="apps-table apps-table--rich">
        <thead>
          <tr>
            <th>Role</th>
            <th>Company</th>
            <th>Experience</th>
            <th>Salary</th>
            <th>Location</th>
            <th>Skills</th>
            <th>Platform</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((app) => (
            <tr key={app.id}>
              <td>
                <div className="apps-table__role">
                  <CompanyLogo app={app} size="sm" />
                  <div>
                    {app.url ? (
                      <a href={app.url} target="_blank" rel="noreferrer">
                        {app.title}
                      </a>
                    ) : (
                      <span>{app.title}</span>
                    )}
                    {app.description ? (
                      <div className="apps-table__desc">{app.description}</div>
                    ) : null}
                    {app.metadata?.skipReason ? (
                      <div className="muted tiny">{app.metadata.skipReason}</div>
                    ) : null}
                  </div>
                </div>
              </td>
              <td>
                <div className="apps-table__company">{app.company}</div>
                {app.rating ? (
                  <div className="muted tiny">{app.rating}★</div>
                ) : null}
              </td>
              <td>{app.experience || '—'}</td>
              <td>{app.salary || '—'}</td>
              <td>{app.location || '—'}</td>
              <td>
                {app.skills && app.skills.length > 0 ? (
                  <ul className="app-card__skills apps-table__skills">
                    {app.skills.slice(0, 4).map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                    {app.skills.length > 4 ? (
                      <li>+{app.skills.length - 4}</li>
                    ) : null}
                  </ul>
                ) : (
                  '—'
                )}
              </td>
              <td className="apps-table__platform">{app.platform}</td>
              <td>
                <span className={sourceBadgeClass(app)}>
                  {sourceLabel(app)}
                </span>
              </td>
              <td className="apps-table__when">
                {new Date(app.appliedAt ?? app.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function readStoredView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'table' || v === 'grid' ? v : 'grid';
  } catch {
    return 'grid';
  }
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [liveHint, setLiveHint] = useState('');
  const { data: onboarding } = useOnboardingStatus();

  const [view, setView] = useState<ViewMode>(readStoredView);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [platform, setPlatform] = useState('all');
  const [source, setSource] = useState<SourceFilter>('all');

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const queryKey = useMemo(
    () => ['applications', { page, limit, q, bucket, platform, source }],
    [page, limit, q, bucket, platform, source]
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchApplications({
        page,
        limit,
        q,
        bucket,
        platform,
        source,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const onUpdate = useCallback(
    (app: Application) => {
      setLiveHint(`Updated: ${app.title} @ ${app.company}`);
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    [queryClient]
  );

  useApplicationSocket(onUpdate);

  const needsPrefs = onboarding && !onboarding.preferencesCompleted;
  const showOnboarding =
    onboarding &&
    !onboarding.extensionConnected &&
    !onboarding.hasApplications;

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasFilters =
    Boolean(q.trim()) ||
    bucket !== 'all' ||
    platform !== 'all' ||
    source !== 'all';

  const clearFilters = () => {
    setQInput('');
    setQ('');
    setBucket('all');
    setPlatform('all');
    setSource('all');
    setPage(1);
  };

  return (
    <div className="page page--wide">
      {needsPrefs && (
        <div className="panel onboarding-panel">
          <h3>Set job preferences</h3>
          <p className="muted">
            Add titles or keywords so Atlas can scan and apply on Naukri.
          </p>
          <Link className="primary-btn" to="/get-started">
            Complete preferences
          </Link>
        </div>
      )}

      {showOnboarding && !needsPrefs && (
        <div className="panel onboarding-panel">
          <ExtensionOnboarding compact userEmail={user?.email} />
          <Link className="onboarding__link" to="/get-started">
            View full setup guide →
          </Link>
        </div>
      )}

      <div className="panel">
        <div className="apps-header">
          <div>
            <h2>Applications</h2>
            <p className="muted apps-header__sub">
              Matched from scan and applied via the extension in near real time.
              {liveHint ? ` · ${liveHint}` : ''}
            </p>
          </div>
          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === 'table' ? 'is-active' : ''}
              onClick={() => setView('table')}
            >
              Table
            </button>
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
          </div>
        </div>

        <div className="apps-toolbar">
          <label className="apps-search">
            <span className="sr-only">Search</span>
            <input
              type="search"
              placeholder="Search role, company, skills…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </label>

          <label>
            Status
            <select
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value as Bucket);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="matched">Matched</option>
              <option value="applied">Applied</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>

          <label>
            Platform
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="naukri">Naukri</option>
              <option value="linkedin">LinkedIn</option>
              <option value="foundit">Foundit</option>
              <option value="indeed">Indeed</option>
              <option value="wellfound">Wellfound</option>
              <option value="internshala">Internshala</option>
            </select>
          </label>

          <label>
            Source
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as SourceFilter);
                setPage(1);
              }}
            >
              <option value="all">All</option>
              <option value="auto_scan">Scan</option>
              <option value="auto_apply">Auto apply</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          <label>
            Per page
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {hasFilters ? (
            <button
              type="button"
              className="secondary-btn apps-clear"
              onClick={clearFilters}
            >
              Clear
            </button>
          ) : null}
        </div>

        {isLoading && <p className="empty">Loading applications…</p>}
        {error && (
          <p className="error">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {data && data.items.length === 0 && !showOnboarding && !needsPrefs && (
          <p className="empty">
            {hasFilters
              ? 'No applications match these filters.'
              : 'No matches yet. Open Naukri while logged in, or use Scan now in the extension.'}
          </p>
        )}

        {data && data.items.length > 0 && (
          <>
            {view === 'table' ? (
              <ApplicationsTable items={data.items} />
            ) : (
              <div className="app-grid">
                {data.items.map((app) => (
                  <ApplicationCard key={app.id} app={app} />
                ))}
              </div>
            )}

            <div className="apps-pagination">
              <p className="apps-pagination__meta">
                Showing {from}–{to} of {total}
                {isFetching && !isLoading ? ' · Updating…' : ''}
              </p>
              <div className="apps-pagination__controls">
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="apps-pagination__page">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
