import { useEffect, useRef, useState, type DragEvent, type MutableRefObject } from 'react';
import type { Application } from '@cosmo/shared';
import { MapPin, MoreHorizontal } from 'lucide-react';
import type { ColumnId } from './trackerColumns';
import {
  ALL_COLUMNS,
  columnFor,
  companyInitials,
  relativeTime,
} from './trackerColumns';

type TrackerCardProps = {
  app: Application;
  density: 'comfortable' | 'compact';
  selected: boolean;
  dragging: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (app: Application) => void;
  onMove: (id: string, column: ColumnId) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string, e: DragEvent) => void;
  onDragEnd: () => void;
  suppressClickRef: MutableRefObject<boolean>;
};

function TrackerLogo({ app }: { app: Application }) {
  const [failed, setFailed] = useState(false);
  if (app.companyLogo && !failed) {
    return (
      <img
        className="tracker-card__logo"
        src={app.companyLogo}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="tracker-card__logo tracker-card__logo--fallback" aria-hidden>
      {companyInitials(app.company)}
    </div>
  );
}

export function TrackerCard({
  app,
  density,
  selected,
  dragging,
  onToggleSelect,
  onOpen,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  suppressClickRef,
}: TrackerCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const col = columnFor(app);
  const when = relativeTime(app.appliedAt ?? app.createdAt);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <article
      className={`tracker-card tracker-card--clickable tracker-card--${col}${
        density === 'compact' ? ' is-compact' : ''
      }${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(app.id, e)}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (suppressClickRef.current) return;
        onOpen(app);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(app);
        }
      }}
      role="button"
      tabIndex={0}
      title={`${app.company} — ${app.title}`}
    >
      <header className="tracker-card__top">
        <label
          className="tracker-card__check"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) =>
              onToggleSelect(app.id, (e.nativeEvent as MouseEvent).shiftKey)
            }
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${app.title}`}
          />
        </label>

        <TrackerLogo app={app} />

        <div className="tracker-card__heading">
          <h3 className="tracker-card__company">{app.company}</h3>
          <p className="tracker-card__title">{app.title}</p>
        </div>

        <div
          className="tracker-card__menu"
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="tracker-card__menu-btn"
            aria-label="Move to"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={15} strokeWidth={2.2} aria-hidden />
          </button>
          {menuOpen ? (
            <div className="tracker-card__menu-pop" role="menu">
              {ALL_COLUMNS.filter((c) => c.id !== col).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onMove(app.id, c.id);
                  }}
                >
                  Move to {c.title}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="tracker-card__menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(app.id);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {density !== 'compact' && (app.location || app.salary) ? (
        <div className="tracker-card__meta">
          {app.location ? (
            <span className="tracker-card__chip">
              <MapPin size={12} strokeWidth={2.2} aria-hidden />
              {app.location}
            </span>
          ) : null}
          {app.salary ? (
            <span className="tracker-card__chip tracker-card__chip--salary">
              {app.salary}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="tracker-card__foot">
        <time dateTime={app.appliedAt ?? app.createdAt}>{when}</time>
        {app.platform ? (
          <span className="tracker-card__platform">{app.platform}</span>
        ) : null}
      </footer>
    </article>
  );
}
