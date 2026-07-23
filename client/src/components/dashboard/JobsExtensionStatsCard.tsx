import { useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Globe2,
  Puzzle,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { BrowserStoreMark } from '../BrowserStoreButtons';

type TabKey = 'jobs' | 'extension';

export type StatsRow = {
  id: string;
  label: string;
  count: number;
  pct: number;
  barClass: string;
  icon:
    | 'applied'
    | 'matched'
    | 'company'
    | 'skipped'
    | 'auto'
    | 'chrome'
    | 'edge'
    | 'firefox'
    | 'connect';
};

function formatCount(n: number): string {
  if (n >= 1000)
    return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 2)}k`.replace(/\.00k$/, 'k');
  return String(n);
}

function RowIcon({ icon }: { icon: StatsRow['icon'] }) {
  if (icon === 'chrome' || icon === 'edge' || icon === 'firefox') {
    return <BrowserStoreMark storeKey={icon} size={22} />;
  }

  const map = {
    applied: CheckCircle2,
    matched: Sparkles,
    company: Globe2,
    skipped: SkipForward,
    auto: Puzzle,
    connect: Briefcase,
  } as const;
  const Icon = map[icon] ?? Briefcase;
  return <Icon size={16} strokeWidth={2.2} aria-hidden />;
}

export function JobsExtensionStatsCard({
  jobsRows,
  extensionRows,
}: {
  jobsRows: StatsRow[];
  extensionRows: StatsRow[];
}) {
  const [tab, setTab] = useState<TabKey>('jobs');
  const rows = tab === 'jobs' ? jobsRows : extensionRows;

  const colLabel = useMemo(
    () => (tab === 'jobs' ? 'STATUS' : 'CHANNEL'),
    [tab],
  );

  return (
    <article
      className="dash-widget dash-breakdown"
      aria-label="Jobs and extension breakdown"
    >
      <div
        className="dash-breakdown__tabs"
        role="tablist"
        aria-label="Breakdown type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'jobs'}
          className={tab === 'jobs' ? 'is-active' : undefined}
          onClick={() => setTab('jobs')}
        >
          Jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'extension'}
          className={tab === 'extension' ? 'is-active' : undefined}
          onClick={() => setTab('extension')}
        >
          Extension
        </button>
      </div>

      <div className="dash-breakdown__table-wrap" role="tabpanel">
        <table className="dash-breakdown__table">
          <thead>
            <tr>
              <th scope="col">NO</th>
              <th scope="col">{colLabel}</th>
              <th scope="col">COUNT</th>
              <th scope="col">DATA IN PERCENTAGE</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="dash-breakdown__empty">
                  No data yet
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="dash-breakdown__name">
                      <span
                        className={`dash-breakdown__icon dash-breakdown__icon--${row.icon}`}
                      >
                        <RowIcon icon={row.icon} />
                      </span>
                      {row.label}
                    </span>
                  </td>
                  <td>{formatCount(row.count)}</td>
                  <td>
                    <div className="dash-breakdown__pct">
                      <div className="dash-breakdown__bar" aria-hidden>
                        <span
                          className={row.barClass}
                          style={{
                            width: `${Math.max(0, Math.min(100, row.pct))}%`,
                          }}
                        />
                      </div>
                      <span>{row.pct.toFixed(2)}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
