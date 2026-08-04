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
  onBulkDelete: () => void;
  onClearSelection: () => void;
  deleteBusy?: boolean;
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
  onBulkDelete,
  onClearSelection,
  deleteBusy = false,
}: TrackerToolbarProps) {
  return (
    <div className="tracker-toolbar">
      <div className="tracker-filters">
        <p className="tracker__sub">
          {prefs.mode === 'advanced' ? 'Advanced' : 'Simple'}
          {total ? (
            <>
              {' '}
              <span className="sidebar__badge tracker__count" aria-label={`${filteredCount} of ${total}`}>
                {filteredCount === total ? filteredCount : `${filteredCount}/${total}`}
              </span>
            </>
          ) : null}
        </p>

        <input
          className="tracker-filters__search"
          type="search"
          placeholder="Search…"
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

        <select
          className="tracker-filters__select"
          value={salaryFilter}
          onChange={(e) =>
            onSalaryFilter(
              e.target.value as 'all' | 'disclosed' | 'undisclosed'
            )
          }
          aria-label="Salary filter"
        >
          <option value="all">All salary</option>
          <option value="disclosed">Disclosed</option>
          <option value="undisclosed">Not disclosed</option>
        </select>

        <select
          className="tracker-filters__select"
          value={prefs.swimlane}
          onChange={(e) => onSwimlane(e.target.value as SwimlaneMode)}
          aria-label="Swimlanes"
        >
          <option value="none">No swimlanes</option>
          <option value="company">By company</option>
          <option value="location">By location</option>
        </select>

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
            Clear
          </button>
        )}

        <div className="tracker-toolbar__right">
          <button
            type="button"
            className="dash-btn dash-btn--ghost tracker-toolbar__icon"
            onClick={onOpenSettings}
            aria-label="Board settings"
            title="Board settings"
          >
            <Settings2 size={15} strokeWidth={2.2} aria-hidden />
          </button>
          <Link className="dash-btn dash-btn--ghost" to="/dashboard">
            Dashboard
          </Link>
        </div>
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
            className="dash-btn dash-btn--ghost tracker-bulk__delete"
            onClick={onBulkDelete}
            disabled={deleteBusy}
          >
            Delete
          </button>
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
