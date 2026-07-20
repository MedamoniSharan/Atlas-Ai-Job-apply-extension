import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@atlas/shared';
import { fetchApplications } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { ExtensionOnboarding } from '../components/ExtensionOnboarding';
import { ApplicationDetailDrawer } from '../components/ApplicationDetailDrawer';
import { useAuthStore } from '../store/authStore';
import type { ShellOutletContext } from '../App';

type DashFilter = 'all' | 'applied' | 'matched' | 'skipped';

const PASTELS = ['yellow', 'green', 'lilac', 'rose'] as const;

function sourceLabel(app: Application): string {
  if (app.metadata?.skipped) return 'Skipped';
  if (app.status === 'applied') return 'Applied';
  if (app.metadata?.source === 'auto_apply') return 'Applied';
  if (app.metadata?.source === 'auto_scan') return 'Matched';
  if (app.status === 'detected') return 'Matched';
  return app.status;
}

function statusClass(app: Application): string {
  const label = sourceLabel(app).toLowerCase();
  if (label === 'applied') return 'dash-status dash-status--submitted';
  if (label === 'skipped') return 'dash-status dash-status--skipped';
  if (label === 'matched') return 'dash-status dash-status--matched';
  return 'dash-status';
}

function estimateMatch(app: Application): number {
  let score = 52;
  if (app.skills?.length) score += Math.min(18, app.skills.length * 3);
  if (app.description && app.description.length > 80) score += 10;
  if (app.experience) score += 6;
  if (app.salary) score += 4;
  if (app.location) score += 4;
  if (app.companyLogo) score += 3;
  if (app.status === 'applied') score += 5;
  return Math.min(96, Math.max(48, score));
}

function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

function CompanyLogo({
  app,
  size = 'md',
}: {
  app: Application;
  size?: 'sm' | 'md';
}) {
  const [failed, setFailed] = useState(false);
  const cls = size === 'sm' ? 'dash-logo dash-logo--sm' : 'dash-logo';

  if (!app.companyLogo || failed) {
    return (
      <div className={`${cls} dash-logo--fallback`} aria-hidden>
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

function MatchRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="dash-match" aria-label={`${value}% match estimate`}>
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle className="dash-match__track" cx="22" cy="22" r={r} />
        <circle
          className="dash-match__value"
          cx="22"
          cy="22"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span>{value}%</span>
    </div>
  );
}

function bucketForFilter(filter: DashFilter): 'all' | 'matched' | 'applied' | 'skipped' {
  return filter;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { search, setSearch } = useOutletContext<ShellOutletContext>();
  const { data: onboarding } = useOnboardingStatus();

  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [filter, setFilter] = useState<DashFilter>('all');
  const [q, setQ] = useState(search);
  const [selected, setSelected] = useState<Application | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const apiBucket = bucketForFilter(filter);

  const queryKey = useMemo(
    () => ['applications', 'dashboard', { page, limit, q, bucket: apiBucket }],
    [page, limit, q, apiBucket]
  );

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchApplications({
        page,
        limit,
        q,
        bucket: apiBucket,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const { data: matchData } = useQuery({
    queryKey: ['applications', 'top-matches'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 8,
        bucket: 'matched',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const onUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
  }, [queryClient]);

  useApplicationSocket(onUpdate);

  const needsPrefs = onboarding && !onboarding.preferencesCompleted;
  const showOnboarding =
    onboarding &&
    !onboarding.extensionConnected &&
    !onboarding.hasApplications;

  const rawItems = data?.items ?? [];
  const items = rawItems;

  const topMatches = (matchData?.items ?? [])
    .filter((a) => !a.metadata?.skipped)
    .slice(0, 4);

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const from = total === 0 || items.length === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="dash">
      {needsPrefs && (
        <div className="dash-callout">
          <div>
            <h3>Set job preferences</h3>
            <p>Add titles or keywords so Tsenta can scan and apply on Naukri.</p>
          </div>
          <Link className="dash-btn dash-btn--primary" to="/get-started">
            Complete preferences
          </Link>
        </div>
      )}

      {showOnboarding && !needsPrefs && (
        <div className="dash-callout dash-callout--stack">
          <ExtensionOnboarding compact userEmail={user?.email} />
          <Link className="dash-inline-link" to="/get-started">
            View full setup guide →
          </Link>
        </div>
      )}

      <section className="dash-section" aria-labelledby="top-matches-heading">
        <div className="dash-section__head">
          <h2 id="top-matches-heading">Top job matches</h2>
        </div>
        {topMatches.length === 0 ? (
          <p className="dash-empty">
            No matches yet. Start the co-pilot on Naukri to fill this row.
          </p>
        ) : (
          <div className="dash-matches">
            {topMatches.map((app, i) => {
              const match = estimateMatch(app);
              const pastel = PASTELS[i % PASTELS.length];
              return (
                <article
                  key={app.id}
                  className={`dash-match-card dash-match-card--${pastel}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(app)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(app);
                    }
                  }}
                >
                  <div className="dash-match-card__top">
                    <p className="dash-match-card__company">{app.company}</p>
                    <MatchRing value={match} />
                  </div>
                  <h3 className="dash-match-card__title">{app.title}</h3>
                  <div className="dash-match-card__foot">
                    <CompanyLogo app={app} size="sm" />
                    {app.url ? (
                      <a
                        className="dash-btn dash-btn--raised"
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Apply
                      </a>
                    ) : (
                      <span className="dash-btn dash-btn--raised dash-btn--disabled">
                        Apply
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="dash-section"
        id="applications"
        aria-labelledby="all-apps-heading"
      >
        <div className="dash-section__head dash-section__head--row">
          <h2 id="all-apps-heading">All applications</h2>
          <div className="dash-section__actions">
            <Link className="dash-btn dash-btn--ghost" to="/tracker">
              Open Tracker
            </Link>
            <Link className="dash-btn dash-btn--primary" to="/settings">
              Preferences
            </Link>
          </div>
        </div>

        <div className="dash-filters" role="tablist" aria-label="Application filters">
          {(
            [
              ['all', 'All'],
              ['applied', 'Applied'],
              ['matched', 'Matched'],
              ['skipped', 'Skipped'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`dash-pill${filter === id ? ' is-active' : ''}`}
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
          {search ? (
            <button
              type="button"
              className="dash-pill dash-pill--clear"
              onClick={() => setSearch('')}
            >
              Clear search
            </button>
          ) : null}
        </div>

        {isLoading && <p className="dash-empty">Loading applications…</p>}
        {error && (
          <p className="error">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {!isLoading && items.length === 0 && !showOnboarding && !needsPrefs && (
          <p className="dash-empty">
            {q || filter !== 'all'
              ? 'No applications match these filters.'
              : 'No applications yet. Open Naukri and start the co-pilot.'}
          </p>
        )}

        {items.length > 0 && (
          <>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Experience</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((app) => (
                    <tr
                      key={app.id}
                      className="dash-table__row--clickable"
                      onClick={() => setSelected(app)}
                    >
                      <td>
                        <div className="dash-position">
                          <CompanyLogo app={app} size="sm" />
                          <div>
                            <strong>{app.company}</strong>
                            <span className="dash-position__title">{app.title}</span>
                            {app.metadata?.skipReason ? (
                              <div className="dash-skip">{app.metadata.skipReason}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>{app.experience || '—'}</td>
                      <td>{app.location || '—'}</td>
                      <td>
                        <span className={statusClass(app)}>
                          {sourceLabel(app)}
                        </span>
                      </td>
                      <td className="dash-when">
                        {relativeTime(app.appliedAt ?? app.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dash-pagination">
              <p>
                Showing {from}–{to}
                {` of ${total}`}
                {isFetching && !isLoading ? ' · Updating…' : ''}
              </p>
              <div className="dash-pagination__controls">
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <ApplicationDetailDrawer
        app={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
