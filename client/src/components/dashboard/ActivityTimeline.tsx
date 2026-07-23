import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, MoreVertical } from 'lucide-react';
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
    let title = `Matched · ${app.company}`;
    if (app.status === 'applied') title = `Applied · ${app.company}`;
    else if (skipped) title = `Skipped · ${app.company}`;
    else if (companySite) title = `Company site · ${app.company}`;

    return {
      id: app.id,
      title,
      description: app.title,
      time: relativeTime(app.appliedAt ?? app.updatedAt ?? app.createdAt),
      tone: skipped ? 'warn' : toneForStatus(app.status),
      meta: app.location || undefined,
      company: app.company,
      logoUrl: app.companyLogo,
    };
  });
}

function TimelineLogo({
  company,
  logoUrl,
}: {
  company: string;
  logoUrl?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!logoUrl || failed) {
    return (
      <span className="dash-timeline__logo dash-timeline__logo--fallback" aria-hidden>
        {companyInitials(company)}
      </span>
    );
  }

  return (
    <img
      className="dash-timeline__logo"
      src={logoUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
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
    <article className="dash-widget dash-timeline" aria-labelledby="activity-timeline-title">
      <header className="dash-timeline__header">
        <h2 id="activity-timeline-title">Activity timeline</h2>
        <div className="dash-timeline__menu-wrap">
          <button
            type="button"
            className="dash-timeline__more"
            aria-label="Open timeline options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={18} aria-hidden />
          </button>
          {menuOpen && (
            <div className="dash-timeline__menu" role="menu">
              <Link to="/applications" role="menuitem" onClick={() => setMenuOpen(false)}>
                View all applications
              </Link>
              <Link to="/tracker" role="menuitem" onClick={() => setMenuOpen(false)}>
                Open tracker
              </Link>
            </div>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="dash-timeline__empty">
          <FileText size={22} aria-hidden />
          <p>{emptyHint}</p>
          <Link to="/get-extension">Get extension</Link>
        </div>
      ) : (
        <ol className="dash-timeline__list">
          {rows.map((item) => (
            <li
              key={item.id}
              className={`dash-timeline__item dash-timeline__item--${item.tone}`}
            >
              <span className="dash-timeline__dot" aria-hidden>
                <TimelineLogo company={item.company} logoUrl={item.logoUrl} />
              </span>
              <div className="dash-timeline__body">
                <div className="dash-timeline__row">
                  <h3>{item.title}</h3>
                  <time>{item.time}</time>
                </div>
                <p>{item.description}</p>
                {item.meta ? (
                  <span className="dash-timeline__meta">{item.meta}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
