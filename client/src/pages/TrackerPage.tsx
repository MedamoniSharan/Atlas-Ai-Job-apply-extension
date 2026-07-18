import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@atlas/shared';
import { fetchApplications } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';

type ColumnId = 'matched' | 'needs_you' | 'submitted' | 'skipped';

const COLUMNS: { id: ColumnId; title: string; hint: string }[] = [
  { id: 'matched', title: 'In flight', hint: 'Matched from scan' },
  { id: 'needs_you', title: 'Needs you', hint: 'Questions or login' },
  { id: 'submitted', title: 'Submitted', hint: 'Applied successfully' },
  { id: 'skipped', title: 'Skipped', hint: 'Not applied' },
];

function isNeedsYou(app: Application): boolean {
  if (!app.metadata?.skipped) return false;
  const reason = String(app.metadata.skipReason || '').toLowerCase();
  return /question|mandatory|user input|login|answer/.test(reason);
}

function columnFor(app: Application): ColumnId {
  if (isNeedsYou(app)) return 'needs_you';
  if (app.metadata?.skipped) return 'skipped';
  if (app.status === 'applied' || app.metadata?.source === 'auto_apply') {
    return 'submitted';
  }
  return 'matched';
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
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function TrackerLogo({ app }: { app: Application }) {
  if (app.companyLogo) {
    return (
      <img
        className="tracker-card__logo"
        src={app.companyLogo}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div className="tracker-card__logo tracker-card__logo--fallback" aria-hidden>
      {companyInitials(app.company)}
    </div>
  );
}

export function TrackerPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['applications', 'tracker'],
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 100 });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const onUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
  }, [queryClient]);

  useApplicationSocket(onUpdate);

  const columns = useMemo(() => {
    const map: Record<ColumnId, Application[]> = {
      matched: [],
      needs_you: [],
      submitted: [],
      skipped: [],
    };
    for (const app of data?.items ?? []) {
      map[columnFor(app)].push(app);
    }
    return map;
  }, [data?.items]);

  const total = data?.items.length ?? 0;

  return (
    <div className="dash tracker">
      <div className="tracker__toolbar">
        <div>
          <p className="tracker__sub">
            Kanban view of your Naukri applications
            {total ? ` · ${total} total` : ''}
          </p>
        </div>
        <Link className="dash-btn dash-btn--ghost" to="/dashboard">
          Open Dashboard
        </Link>
      </div>

      {isLoading && <p className="dash-empty">Loading tracker…</p>}
      {error && (
        <p className="error">
          {error instanceof Error ? error.message : 'Failed to load'}
        </p>
      )}

      {!isLoading && total === 0 && (
        <div className="dash-callout">
          <div>
            <h3>No applications yet</h3>
            <p>
              Start the Naukri co-pilot to fill In flight, Submitted, and other
              columns.
            </p>
          </div>
          <Link className="dash-btn dash-btn--primary" to="/dashboard">
            Back to Dashboard
          </Link>
        </div>
      )}

      {total > 0 && (
        <div className="tracker-board" role="list">
          {COLUMNS.map((col) => (
            <section
              key={col.id}
              className={`tracker-col tracker-col--${col.id}`}
              aria-label={col.title}
            >
              <header className="tracker-col__head">
                <div>
                  <h2>{col.title}</h2>
                  <p>{col.hint}</p>
                </div>
                <span className="tracker-col__count">
                  {columns[col.id].length}
                </span>
              </header>
              <div className="tracker-col__list">
                {columns[col.id].length === 0 ? (
                  <p className="tracker-col__empty">No cards</p>
                ) : (
                  columns[col.id].map((app) => (
                    <article key={app.id} className="tracker-card" role="listitem">
                      <div className="tracker-card__top">
                        <TrackerLogo app={app} />
                        <time dateTime={app.appliedAt ?? app.createdAt}>
                          {relativeTime(app.appliedAt ?? app.createdAt)}
                        </time>
                      </div>
                      <h3 className="tracker-card__company">{app.company}</h3>
                      {app.url ? (
                        <a
                          className="tracker-card__title"
                          href={app.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {app.title}
                        </a>
                      ) : (
                        <p className="tracker-card__title">{app.title}</p>
                      )}
                      <div className="tracker-card__meta">
                        {app.location ? <span>{app.location}</span> : null}
                        {app.experience ? <span>{app.experience}</span> : null}
                        <span className="tracker-card__platform">
                          {app.platform}
                        </span>
                      </div>
                      {app.metadata?.skipReason ? (
                        <p className="tracker-card__skip">
                          {app.metadata.skipReason}
                        </p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
