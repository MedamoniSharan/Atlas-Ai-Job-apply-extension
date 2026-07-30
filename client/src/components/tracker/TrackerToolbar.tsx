import { Link } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import type { BoardPrefs, ColumnId, SwimlaneMode } from './trackerColumns';

type TrackerToolbarProps = {
  total: number;
  filteredCount: number;
  q: string;
  platform: string;
  salaryFilter: 'all' | 'disclosed' | 'undisclosed';
  platforms: string[];
  prefs: BoardPrefs;
  selectedCount: number;
  columns: { id: ColumnId; title: string }[];
  onSearch: (q: string) => void;
  onPlatform: (platform: string) => void;
  onSalaryFilter: (v: 'all' | 'disclosed' | 'undisclosed') => void;
  onSwimlane: (v: SwimlaneMode) => void;
  onOpenSettings: () => void;
  onBulkMove: (column: ColumnId) => void;
  onClearSelection: () => void;
};

export function TrackerToolbar({
  total,
  filteredCount,
  q,
  platform,
  salaryFilter,
  platforms,
  prefs,
  selectedCount,
  columns,
  onSearch,
  onPlatform,
  onSalaryFilter,
  onSwimlane,
  onOpenSettings,
  onBulkMove,
  onClearSelection,
}: TrackerToolbarProps) {
  return (
    <div className="tracker-toolbar">
      <div className="tracker__toolbar">
        <div>
          <p className="tracker__sub">
            {prefs.mode === 'advanced' ? 'Advanced' : 'Simple'} board
            {total ? ` · ${filteredCount}/${total}` : ''}
            {' · '}
            Drag cards or use bulk move
          </p>
        </div>
        <div className="tracker-toolbar__right">
          <button
            type="button"
            className="dash-btn dash-btn--ghost"
            onClick={onOpenSettings}
            aria-label="Board settings"
          >
            <Settings2 size={15} strokeWidth={2.2} aria-hidden />
            Settings
          </button>
          <Link className="dash-btn dash-btn--ghost" to="/dashboard">
            Open Dashboard
          </Link>
        </div>
      </div>

      <div className="tracker-filters">
        <input
          className="tracker-filters__search"
          type="search"
          placeholder="Search title, company, location…"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search applications"
        />

        <select
          className="tracker-filters__select"
          value={platform}
          onChange={(e) => onPlatform(e.target.value)}
          aria-label="Platform filter"
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="tracker-filters__chips" role="group" aria-label="Salary filter">
          {(
            [
              ['all', 'All salary'],
              ['disclosed', 'Disclosed'],
              ['undisclosed', 'Not disclosed'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dash-pill${salaryFilter === id ? ' is-active' : ''}`}
              onClick={() => onSalaryFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tracker-filters__chips" role="group" aria-label="Swimlanes">
          {(
            [
              ['none', 'No swimlanes'],
              ['company', 'By company'],
              ['location', 'By location'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`dash-pill${prefs.swimlane === id ? ' is-active' : ''}`}
              onClick={() => onSwimlane(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {(q || platform !== 'all' || salaryFilter !== 'all') && (
          <button
            type="button"
            className="dash-pill dash-pill--clear"
            onClick={() => {
              onSearch('');
              onPlatform('all');
              onSalaryFilter('all');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {selectedCount > 0 ? (
        <div className="tracker-bulk" role="status">
          <span>
            <strong>{selectedCount}</strong> selected
          </span>
          <label className="tracker-bulk__move">
            Move to
            <select
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value as ColumnId;
                if (!value) return;
                onBulkMove(value);
                e.target.value = '';
              }}
              aria-label="Bulk move to column"
            >
              <option value="" disabled>
                Choose column…
              </option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="dash-btn dash-btn--ghost"
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
