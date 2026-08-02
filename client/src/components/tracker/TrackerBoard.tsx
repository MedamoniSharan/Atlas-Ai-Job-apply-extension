import { useMemo, useState, type DragEvent, type MutableRefObject } from 'react';
import type { Application } from '@cosmo/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TrackerCard } from './TrackerCard';
import type { BoardPrefs, ColumnDef, ColumnId } from './trackerColumns';
import { swimlaneKey } from './trackerColumns';

type TrackerBoardProps = {
  columns: ColumnDef[];
  items: Application[];
  prefs: BoardPrefs;
  selectedIds: Set<string>;
  draggingId: string | null;
  overColumn: ColumnId | null;
  columnFor: (app: Application) => ColumnId;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (app: Application) => void;
  onMove: (id: string, column: ColumnId) => void;
  onDragStart: (id: string, e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOverColumn: (column: ColumnId) => void;
  onDragLeaveColumn: (column: ColumnId) => void;
  onDropColumn: (column: ColumnId) => void;
  suppressClickRef: MutableRefObject<boolean>;
};

export function TrackerBoard({
  columns,
  items,
  prefs,
  selectedIds,
  draggingId,
  overColumn,
  columnFor,
  onToggleSelect,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDragLeaveColumn,
  onDropColumn,
  suppressClickRef,
}: TrackerBoardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const byColumn = useMemo(() => {
    const map: Record<ColumnId, Application[]> = {
      matched: [],
      applied: [],
      interview: [],
      offer: [],
      rejected: [],
      skipped: [],
    };
    for (const app of items) {
      map[columnFor(app)].push(app);
    }
    return map;
  }, [items, columnFor]);

  const laneKeys = useMemo(() => {
    if (prefs.swimlane === 'none') return ['All'];
    const keys = new Set<string>();
    for (const app of items) {
      keys.add(swimlaneKey(app, prefs.swimlane));
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }, [items, prefs.swimlane]);

  const colTemplate = `minmax(0, 1fr) `.repeat(columns.length).trim();

  return (
    <div
      className={`tracker-board tracker-board--advanced${
        prefs.density === 'compact' ? ' is-compact' : ''
      }${prefs.swimlane !== 'none' ? ' has-swimlanes' : ''}`}
      style={{ ['--tracker-cols' as string]: String(columns.length) }}
    >
      <div
        className="tracker-board__header"
        style={{ gridTemplateColumns: colTemplate }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            className={`tracker-col-head tracker-col--${col.id}${
              overColumn === col.id ? ' is-drop-target' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              onDragOverColumn(col.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDropColumn(col.id);
            }}
          >
            <div>
              <h2>{col.title}</h2>
              <p>{col.hint}</p>
            </div>
            <span className="tracker-col__count">{byColumn[col.id].length}</span>
          </div>
        ))}
      </div>

      {laneKeys.map((lane) => {
        const isCollapsed = Boolean(collapsed[lane]);
        const laneItems =
          prefs.swimlane === 'none'
            ? items
            : items.filter((a) => swimlaneKey(a, prefs.swimlane) === lane);

        return (
          <section key={lane} className="tracker-lane">
            {prefs.swimlane !== 'none' ? (
              <button
                type="button"
                className="tracker-lane__head"
                style={{ gridColumn: `1 / span ${columns.length}` }}
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [lane]: !prev[lane] }))
                }
              >
                {isCollapsed ? (
                  <ChevronRight size={16} aria-hidden />
                ) : (
                  <ChevronDown size={16} aria-hidden />
                )}
                <span className="tracker-lane__title">{lane}</span>
                <span className="tracker-lane__count">{laneItems.length}</span>
              </button>
            ) : null}

            {!isCollapsed ? (
              <div
                className="tracker-lane__row"
                style={{ gridTemplateColumns: colTemplate }}
              >
                {columns.map((col) => {
                  const cards = laneItems.filter(
                    (a) => columnFor(a) === col.id
                  );
                  return (
                    <div
                      key={`${lane}-${col.id}`}
                      className={`tracker-col tracker-col--${col.id}${
                        overColumn === col.id ? ' is-drop-target' : ''
                      }${draggingId ? ' is-dragging-active' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        onDragOverColumn(col.id);
                      }}
                      onDragLeave={(e) => {
                        if (
                          e.currentTarget.contains(
                            e.relatedTarget as Node | null
                          )
                        ) {
                          return;
                        }
                        onDragLeaveColumn(col.id);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDropColumn(col.id);
                      }}
                    >
                      <div className="tracker-col__list">
                        {cards.length === 0 ? (
                          <p className="tracker-col__empty">
                            {draggingId ? 'Drop here' : 'No cards'}
                          </p>
                        ) : (
                          cards.map((app) => (
                            <TrackerCard
                              key={app.id}
                              app={app}
                              density={prefs.density}
                              selected={selectedIds.has(app.id)}
                              dragging={draggingId === app.id}
                              onToggleSelect={onToggleSelect}
                              onOpen={onOpen}
                              onMove={onMove}
                              onDragStart={onDragStart}
                              onDragEnd={onDragEnd}
                              suppressClickRef={suppressClickRef}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
