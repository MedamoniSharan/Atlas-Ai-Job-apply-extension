import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, MoreVertical } from 'lucide-react';
import type { Application } from '@atlas/shared';

export type TimelineItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: 'primary' | 'success' | 'info' | 'warn';
  meta?: string;
  company: string;
  logoUrl?: string;
  statusLabel: string;
};

const POINT_COLORS: Record<
  TimelineItem['tone'],
  { color: string; ring: string }
> = {
  primary: { color: '#15362b', ring: 'rgba(21, 54, 43, 0.18)' },
  success: { color: '#2f6b52', ring: 'rgba(47, 107, 82, 0.18)' },
  info: { color: '#0b7ea4', ring: 'rgba(11, 126, 164, 0.18)' },
  warn: { color: '#e08a2b', ring: 'rgba(224, 138, 43, 0.18)' },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

function toneForStatus(status: Application['status']): TimelineItem['tone'] {
  if (status === 'applied' || status === 'offer') return 'success';
  if (status === 'interview') return 'info';
  if (status === 'rejected') return 'warn';
  return 'primary';
}

function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function appsToTimeline(apps: Application[]): TimelineItem[] {
  return apps.slice(0, 6).map((app) => {
    const skipped = Boolean(app.metadata?.skipped);
    const companySite = Boolean(app.metadata?.companySiteApply);
    let statusLabel = 'Matched';
    if (app.status === 'applied') statusLabel = 'Applied';
    else if (skipped) statusLabel = 'Skipped';
    else if (companySite) statusLabel = 'Company site';

    return {
      id: app.id,
      title: `${statusLabel} · ${app.company}`,
      description: app.title,
      time: relativeTime(app.appliedAt ?? app.updatedAt ?? app.createdAt),
      tone: skipped ? 'warn' : toneForStatus(app.status),
      meta: app.location || undefined,
      company: app.company,
      logoUrl: app.companyLogo,
      statusLabel,
    };
  });
}

function CompanyChip({
  company,
  logoUrl,
  role,
}: {
  company: string;
  logoUrl?: string;
  role?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="dash-timeline__client">
      {!logoUrl || failed ? (
        <span className="dash-timeline__client-avatar" aria-hidden>
          {companyInitials(company)}
        </span>
      ) : (
        <img
          className="dash-timeline__client-logo"
          src={logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <div>
        <p className="dash-timeline__client-name">{company}</p>
        {role ? <span className="dash-timeline__client-role">{role}</span> : null}
      </div>
    </div>
  );
}

export function ActivityTimeline({
  items,
  emptyHint = 'Activity will show up as Cosmo scans and applies.',
}: {
  items: TimelineItem[];
  emptyHint?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rows = useMemo(() => items, [items]);

  return (
    <article
      className="dash-widget dash-timeline"
      aria-labelledby="activity-timeline-title"
    >
      <header className="dash-timeline__header">
        <h2 id="activity-timeline-title">Activity timeline</h2>
        <div className="dash-timeline__menu-wrap">
          <button
            type="button"
            className="dash-timeline__more"
            aria-label="Open timeline actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={22} strokeWidth={2} aria-hidden />
          </button>
          {menuOpen ? (
            <ul className="dash-timeline__menu" aria-label="Timeline actions">
              <li>
                <Link to="/applications" onClick={() => setMenuOpen(false)}>
                  View all applications
                </Link>
              </li>
              <li>
                <Link to="/tracker" onClick={() => setMenuOpen(false)}>
                  Open tracker
                </Link>
              </li>
              <li>
                <button type="button" onClick={() => setMenuOpen(false)}>
                  Refresh
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      </header>

      <section className="dash-timeline__section" aria-label="Recent activity">
        {rows.length === 0 ? (
          <div className="dash-timeline__empty">
            <FileText size={22} aria-hidden />
            <p>{emptyHint}</p>
            <Link to="/get-extension">Get extension</Link>
          </div>
        ) : (
          <ol className="dash-timeline__list">
            {rows.map((item) => {
              const point = POINT_COLORS[item.tone];
              return (
                <li className="dash-timeline__item" key={item.id}>
                  <span
                    className="dash-timeline__point"
                    style={
                      {
                        '--point-color': point.color,
                        '--point-ring': point.ring,
                      } as CSSProperties
                    }
                    aria-hidden
                  />
                  <div className="dash-timeline__event">
                    <header className="dash-timeline__event-header">
                      <h3 className="dash-timeline__event-title">{item.title}</h3>
                      <time className="dash-timeline__time">{item.time}</time>
                    </header>
                    <p className="dash-timeline__description">{item.description}</p>
                    {item.statusLabel === 'Applied' ? (
                      <div className="dash-timeline__chip">
                        <CheckCircle2 size={16} aria-hidden />
                        <span>Applied via Cosmo</span>
                      </div>
                    ) : null}
                    <CompanyChip
                      company={item.company}
                      logoUrl={item.logoUrl}
                      role={item.meta}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </article>
  );
}
