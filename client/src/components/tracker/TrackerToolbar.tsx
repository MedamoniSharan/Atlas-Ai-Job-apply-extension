import { Link } from 'react-router-dom';
import { Search, Settings2, X } from 'lucide-react';
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
  const filtersActive =
    Boolean(q) || platform !== 'all' || salaryFilter !== 'all';

  return (
    <div className="tracker-toolbar">
      <div className="tracker-toolbar__top">
        <div className="tracker-toolbar__title-block">
          <h2 className="tracker-toolbar__title">Pipeline</h2>
          <p className="tracker-toolbar__meta">
            <span className="tracker-toolbar__mode">
              {prefs.mode === 'advanced' ? 'Advanced' : 'Simple'} board
            </span>
            {total > 0 ? (
              <span className="tracker-toolbar__count">
                {filteredCount === total
                  ? `${total} job${total === 1 ? '' : 's'}`
                  : `${filteredCount} of ${total}`}
              </span>
            ) : null}
          </p>
        </div>

        <div className="tracker-toolbar__actions">
          <button
            type="button"
            className="tracker-toolbar__icon-btn"
            onClick={onOpenSettings}
            aria-label="Board settings"
            title="Board settings"
          >
            <Settings2 size={16} strokeWidth={2.1} aria-hidden />
          </button>
          <Link className="tracker-toolbar__link" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="tracker-filters">
        <label className="tracker-filters__search">
          <Search size={15} strokeWidth={2} aria-hidden />
          <input
            type="search"
            placeholder="Search title or company…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search applications"
          />
        </label>

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

        {filtersActive ? (
          <button
            type="button"
            className="tracker-filters__clear"
            onClick={() => {
              onSearch('');
              onPlatform('all');
              onSalaryFilter('all');
            }}
          >
            <X size={14} strokeWidth={2.2} aria-hidden />
            Clear
          </button>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <div className="tracker-bulk" role="status">
          <span className="tracker-bulk__label">
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
            className="tracker-bulk__btn tracker-bulk__btn--danger"
            onClick={onBulkDelete}
            disabled={deleteBusy}
          >
            Delete
          </button>
          <button
            type="button"
            className="tracker-bulk__btn"
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
