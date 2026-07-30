import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@cosmo/shared';
import { fetchApplications, moveApplicationTracker } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { ApplicationDetailDrawer } from '../components/ApplicationDetailDrawer';
import { CosmosLoader } from '../components/CosmosLogo';

type ColumnId = 'applied' | 'matched' | 'skipped';

const COLUMNS: { id: ColumnId; title: string; hint: string }[] = [
  { id: 'applied', title: 'Applied', hint: 'Applied successfully' },
  { id: 'matched', title: 'Matched', hint: 'Matched from scan' },
  { id: 'skipped', title: 'Skipped', hint: 'Not applied' },
];

function columnFor(app: Application): ColumnId {
  if (app.metadata?.skipped) return 'skipped';
  if (app.status === 'applied' || app.metadata?.source === 'auto_apply') {
    return 'applied';
  }
  return 'matched';
}

/** Optimistic local shape after a tracker move. */
function applyColumnLocally(app: Application, column: ColumnId): Application {
  const metadata = { ...(app.metadata ?? {}) };
  if (column === 'applied') {
    return {
      ...app,
      status: 'applied',
      appliedAt: app.appliedAt ?? new Date().toISOString(),
      metadata: {
        ...metadata,
        skipped: false,
        skipReason: undefined,
      },
    };
  }
  if (column === 'matched') {
    return {
      ...app,
      status: app.status === 'applied' ? 'detected' : app.status,
      metadata: {
        ...metadata,
        skipped: false,
        skipReason: undefined,
        companySiteApply: false,
        source:
          metadata.source === 'auto_apply' ? 'auto_scan' : metadata.source,
      },
    };
  }
  return {
    ...app,
    status: app.status === 'applied' ? 'detected' : app.status,
    metadata: {
      ...metadata,
      skipped: true,
      skipReason: metadata.skipReason || 'Moved to Skipped',
      companySiteApply: false,
    },
  };
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
  const [selected, setSelected] = useState<Application | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ColumnId | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const queryKey = ['applications', 'tracker'] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 100 });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      id,
      column,
    }: {
      id: string;
      column: ColumnId;
    }) => {
      const res = await moveApplicationTracker(id, column);
      if (!res.success) throw new Error(res.message || 'Move failed');
      return res.data;
    },
    onMutate: async ({ id, column }) => {
      setMoveError(null);
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{
        items: Application[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(queryKey);
      if (prev) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          items: prev.items.map((app) =>
            app.id === id ? applyColumnLocally(app, column) : app
          ),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      setMoveError(err instanceof Error ? err.message : 'Could not move card');
    },
    onSuccess: (updated) => {
      const prev = queryClient.getQueryData<{
        items: Application[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(queryKey);
      if (prev && updated) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          items: prev.items.map((app) =>
            app.id === updated.id ? updated : app
          ),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const onUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
  }, [queryClient]);

  useApplicationSocket(onUpdate);

  const columns = useMemo(() => {
    const map: Record<ColumnId, Application[]> = {
      applied: [],
      matched: [],
      skipped: [],
    };
    for (const app of data?.items ?? []) {
      map[columnFor(app)].push(app);
    }
    return map;
  }, [data?.items]);

  const total = data?.items.length ?? 0;

  function handleDrop(column: ColumnId) {
    const id = draggingId;
    setOverColumn(null);
    setDraggingId(null);
    if (!id) return;
    const app = data?.items.find((a) => a.id === id);
    if (!app) return;
    if (columnFor(app) === column) return;
    moveMutation.mutate({ id, column });
  }

  return (
    <div className="dash tracker">
      <div className="tracker__toolbar">
        <div>
          <p className="tracker__sub">
            Kanban view of your Naukri applications
            {total ? ` · ${total} total` : ''}
            {' · '}
            Drag cards between columns
          </p>
        </div>
        <Link className="dash-btn dash-btn--ghost" to="/dashboard">
          Open Dashboard
        </Link>
      </div>

      {moveError ? <p className="error">{moveError}</p> : null}

      {isLoading && (
        <CosmosLoader
          label="Loading tracker…"
          className="cosmos-loader--inline"
        />
      )}
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
              Start the Naukri co-pilot to fill Applied, Matched, and Skipped
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
              className={`tracker-col tracker-col--${col.id}${
                overColumn === col.id ? ' is-drop-target' : ''
              }${draggingId ? ' is-dragging-active' : ''}`}
              aria-label={col.title}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverColumn(col.id);
              }}
              onDragLeave={(e) => {
                if (
                  e.currentTarget.contains(e.relatedTarget as Node | null)
                ) {
                  return;
                }
                setOverColumn((cur) => (cur === col.id ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.id);
              }}
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
                  <p className="tracker-col__empty">
                    {draggingId ? 'Drop here' : 'No cards'}
                  </p>
                ) : (
                  columns[col.id].map((app) => (
                    <article
                      key={app.id}
                      className={`tracker-card tracker-card--clickable${
                        draggingId === app.id ? ' is-dragging' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        dragMoved.current = false;
                        setDraggingId(app.id);
                        e.dataTransfer.setData('text/plain', app.id);
                        e.dataTransfer.effectAllowed = 'move';
                        // Avoid opening drawer after a drag.
                        requestAnimationFrame(() => {
                          dragMoved.current = true;
                        });
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverColumn(null);
                        window.setTimeout(() => {
                          dragMoved.current = false;
                        }, 50);
                      }}
                      onClick={() => {
                        if (dragMoved.current || draggingId) return;
                        setSelected(app);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(app);
                        }
                      }}
                    >
                      <div className="tracker-card__top">
                        <TrackerLogo app={app} />
                        <time dateTime={app.appliedAt ?? app.createdAt}>
                          {relativeTime(app.appliedAt ?? app.createdAt)}
                        </time>
                      </div>
                      <h3 className="tracker-card__company">{app.company}</h3>
                      <p className="tracker-card__title">{app.title}</p>
                      <div className="tracker-card__meta">
                        {app.location ? <span>{app.location}</span> : null}
                        {app.experience ? <span>{app.experience}</span> : null}
                        <span className="tracker-card__platform">
                          {app.platform}
                        </span>
                      </div>
                      <p className="tracker-card__drag-hint">Drag to move</p>
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <ApplicationDetailDrawer
        app={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
