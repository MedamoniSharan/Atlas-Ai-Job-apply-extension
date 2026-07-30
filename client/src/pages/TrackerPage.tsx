import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@cosmo/shared';
import {
  fetchApplications,
  moveApplicationTracker,
  moveApplicationsTrackerBulk,
} from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { ApplicationDetailDrawer } from '../components/ApplicationDetailDrawer';
import { CosmosLoader } from '../components/CosmosLogo';
import { TrackerBoard } from '../components/tracker/TrackerBoard';
import { TrackerSettings } from '../components/tracker/TrackerSettings';
import { TrackerToolbar } from '../components/tracker/TrackerToolbar';
import {
  applyColumnLocally,
  columnFor,
  columnsForPrefs,
  matchesTrackerFilters,
  readBoardPrefs,
  writeBoardPrefs,
  type BoardPrefs,
  type ColumnId,
  type SwimlaneMode,
} from '../components/tracker/trackerColumns';

type TrackerListData = {
  items: Application[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const QUERY_KEY = ['applications', 'tracker'] as const;

export function TrackerPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Application | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ColumnId | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<BoardPrefs>(() => readBoardPrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const [salaryFilter, setSalaryFilter] = useState<
    'all' | 'disclosed' | 'undisclosed'
  >('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedId = useRef<string | null>(null);
  const suppressClickRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 200 });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const updatePrefs = useCallback((next: BoardPrefs) => {
    setPrefs(next);
    writeBoardPrefs(next);
  }, []);

  const patchItems = useCallback(
    (updater: (items: Application[]) => Application[]) => {
      const prev = queryClient.getQueryData<TrackerListData>(QUERY_KEY);
      if (!prev) return;
      queryClient.setQueryData(QUERY_KEY, {
        ...prev,
        items: updater(prev.items),
      });
    },
    [queryClient]
  );

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
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<TrackerListData>(QUERY_KEY);
      patchItems((items) =>
        items.map((app) =>
          app.id === id ? applyColumnLocally(app, column) : app
        )
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      setMoveError(err instanceof Error ? err.message : 'Could not move card');
    },
    onSuccess: (updated) => {
      if (updated) {
        patchItems((items) =>
          items.map((app) => (app.id === updated.id ? updated : app))
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({
      ids,
      column,
    }: {
      ids: string[];
      column: ColumnId;
    }) => {
      const res = await moveApplicationsTrackerBulk(ids, column);
      if (!res.success) throw new Error(res.message || 'Bulk move failed');
      return res.data;
    },
    onMutate: async ({ ids, column }) => {
      setMoveError(null);
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const prev = queryClient.getQueryData<TrackerListData>(QUERY_KEY);
      const idSet = new Set(ids);
      patchItems((items) =>
        items.map((app) =>
          idSet.has(app.id) ? applyColumnLocally(app, column) : app
        )
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev);
      setMoveError(
        err instanceof Error ? err.message : 'Could not bulk-move cards'
      );
    },
    onSuccess: (result) => {
      if (result?.items?.length) {
        const byId = new Map(result.items.map((a) => [a.id, a]));
        patchItems((items) =>
          items.map((app) => byId.get(app.id) ?? app)
        );
      }
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const onUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
  }, [queryClient]);

  useApplicationSocket(onUpdate);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const columns = useMemo(() => columnsForPrefs(prefs), [prefs]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    for (const app of data?.items ?? []) {
      if (app.platform) set.add(app.platform);
    }
    return [...set].sort();
  }, [data?.items]);

  const filteredItems = useMemo(() => {
    return (data?.items ?? []).filter((app) =>
      matchesTrackerFilters(app, { q, platform, salaryFilter })
    );
  }, [data?.items, q, platform, salaryFilter]);

  const total = data?.items.length ?? 0;

  function moveOne(id: string, column: ColumnId) {
    const app = data?.items.find((a) => a.id === id);
    if (!app) return;
    if (columnFor(app) === column) return;
    moveMutation.mutate({ id, column });
  }

  function handleDrop(column: ColumnId) {
    const id = draggingId;
    setOverColumn(null);
    setDraggingId(null);
    if (!id) return;
    moveOne(id, column);
  }

  function toggleSelect(id: string, shiftKey: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId.current) {
        const order = filteredItems.map((a) => a.id);
        const a = order.indexOf(lastSelectedId.current);
        const b = order.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(order[i]!);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastSelectedId.current = id;
      return next;
    });
  }

  return (
    <div className="dash tracker">
      <TrackerToolbar
        total={total}
        filteredCount={filteredItems.length}
        q={q}
        platform={platform}
        salaryFilter={salaryFilter}
        platforms={platforms}
        prefs={prefs}
        selectedCount={selectedIds.size}
        columns={columns}
        onSearch={setQ}
        onPlatform={setPlatform}
        onSalaryFilter={setSalaryFilter}
        onSwimlane={(swimlane: SwimlaneMode) =>
          updatePrefs({ ...prefs, swimlane })
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onBulkMove={(column) => {
          const ids = [...selectedIds];
          if (!ids.length) return;
          bulkMutation.mutate({ ids, column });
        }}
        onClearSelection={() => setSelectedIds(new Set())}
      />

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
              Start the Naukri co-pilot to fill your Tracker board columns.
            </p>
          </div>
          <Link className="dash-btn dash-btn--primary" to="/dashboard">
            Back to Dashboard
          </Link>
        </div>
      )}

      {total > 0 && filteredItems.length === 0 && (
        <div className="dash-callout">
          <div>
            <h3>No matching cards</h3>
            <p>Try clearing search or filters.</p>
          </div>
        </div>
      )}

      {filteredItems.length > 0 && (
        <TrackerBoard
          columns={columns}
          items={filteredItems}
          prefs={prefs}
          selectedIds={selectedIds}
          draggingId={draggingId}
          overColumn={overColumn}
          columnFor={columnFor}
          onToggleSelect={toggleSelect}
          onOpen={setSelected}
          onMove={moveOne}
          onDragStart={(id, e) => {
            suppressClickRef.current = false;
            setDraggingId(id);
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => {
              suppressClickRef.current = true;
            });
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setOverColumn(null);
            window.setTimeout(() => {
              suppressClickRef.current = false;
            }, 50);
          }}
          onDragOverColumn={setOverColumn}
          onDragLeaveColumn={(col) =>
            setOverColumn((cur) => (cur === col ? null : cur))
          }
          onDropColumn={handleDrop}
          suppressClickRef={suppressClickRef}
        />
      )}

      <TrackerSettings
        open={settingsOpen}
        prefs={prefs}
        onChange={updatePrefs}
        onClose={() => setSettingsOpen(false)}
      />

      <ApplicationDetailDrawer
        app={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
