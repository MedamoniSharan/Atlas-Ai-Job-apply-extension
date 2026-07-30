import type { BoardPrefs, ColumnId, SwimlaneMode } from './trackerColumns';
import { ADVANCED_COLUMN_IDS, ALL_COLUMNS, SIMPLE_COLUMN_IDS } from './trackerColumns';

type TrackerSettingsProps = {
  open: boolean;
  prefs: BoardPrefs;
  onChange: (next: BoardPrefs) => void;
  onClose: () => void;
};

export function TrackerSettings({
  open,
  prefs,
  onChange,
  onClose,
}: TrackerSettingsProps) {
  if (!open) return null;

  function setMode(mode: BoardPrefs['mode']) {
    onChange({
      ...prefs,
      mode,
      visibleColumns:
        mode === 'simple' ? [...SIMPLE_COLUMN_IDS] : [...ADVANCED_COLUMN_IDS],
    });
  }

  function toggleColumn(id: ColumnId) {
    if (prefs.mode === 'simple') return;
    const has = prefs.visibleColumns.includes(id);
    let visibleColumns = has
      ? prefs.visibleColumns.filter((c) => c !== id)
      : [...prefs.visibleColumns, id];
    if (!visibleColumns.length) visibleColumns = [id];
    onChange({ ...prefs, visibleColumns });
  }

  return (
    <div className="tracker-settings" role="dialog" aria-label="Board settings">
      <div className="tracker-settings__backdrop" onClick={onClose} />
      <aside className="tracker-settings__panel">
        <header className="tracker-settings__head">
          <h3>Board settings</h3>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="tracker-settings__hint">
          Drag cards between columns or use bulk move. Advanced mode unlocks Interview,
          Offer, and Rejected.
        </p>

        <section className="tracker-settings__section">
          <h4>Mode</h4>
          <div className="tracker-settings__row">
            <button
              type="button"
              className={`dash-pill${prefs.mode === 'simple' ? ' is-active' : ''}`}
              onClick={() => setMode('simple')}
            >
              Simple
            </button>
            <button
              type="button"
              className={`dash-pill${prefs.mode === 'advanced' ? ' is-active' : ''}`}
              onClick={() => setMode('advanced')}
            >
              Advanced
            </button>
          </div>
        </section>

        <section className="tracker-settings__section">
          <h4>Density</h4>
          <div className="tracker-settings__row">
            <button
              type="button"
              className={`dash-pill${prefs.density === 'comfortable' ? ' is-active' : ''}`}
              onClick={() => onChange({ ...prefs, density: 'comfortable' })}
            >
              Comfortable
            </button>
            <button
              type="button"
              className={`dash-pill${prefs.density === 'compact' ? ' is-active' : ''}`}
              onClick={() => onChange({ ...prefs, density: 'compact' })}
            >
              Compact
            </button>
          </div>
        </section>

        <section className="tracker-settings__section">
          <h4>Default swimlane</h4>
          <div className="tracker-settings__row">
            {(
              [
                ['none', 'None'],
                ['company', 'Company'],
                ['location', 'Location'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`dash-pill${prefs.swimlane === id ? ' is-active' : ''}`}
                onClick={() =>
                  onChange({ ...prefs, swimlane: id as SwimlaneMode })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {prefs.mode === 'advanced' ? (
          <section className="tracker-settings__section">
            <h4>Visible columns</h4>
            <div className="tracker-settings__cols">
              {ALL_COLUMNS.map((col) => (
                <label key={col.id} className="tracker-settings__check">
                  <input
                    type="checkbox"
                    checked={prefs.visibleColumns.includes(col.id)}
                    onChange={() => toggleColumn(col.id)}
                  />
                  <span>{col.title}</span>
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
