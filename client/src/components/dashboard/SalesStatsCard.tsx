import { useState } from 'react';
import { MoreVertical, Sparkles } from 'lucide-react';

const periods = ['Last 28 Days', 'Last Month', 'Last Year'] as const;

function ApplyRing({ value }: { value: number }) {
  const deg = Math.max(0, Math.min(100, value)) * 3.6;
  return (
    <div
      className="dash-sales__ring"
      role="img"
      aria-label={`Apply conversion ratio ${value}%`}
      style={{
        background: `conic-gradient(from -90deg, #2f6b52 0deg ${deg}deg, #e9edf0 ${deg}deg 360deg)`,
      }}
    >
      <div className="dash-sales__ring-inner">
        <Sparkles
          aria-hidden
          size={38}
          strokeWidth={1.8}
          className="dash-sales__sparkle"
        />
        <strong>{value}%</strong>
        <span>Applied</span>
      </div>
    </div>
  );
}

export interface SalesStatsCardProps {
  conversionPct: number;
  totalJobs: number;
  appliedCount: number;
}

export function SalesStatsCard({
  conversionPct,
  totalJobs,
  appliedCount,
}: SalesStatsCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[0]);

  return (
    <article className="dash-widget dash-sales">
      <header className="dash-sales__header">
        <div>
          <h2 className="dash-sales__title">Apply stats</h2>
          <p className="dash-sales__subtitle">
            {totalJobs.toLocaleString()} jobs · {appliedCount.toLocaleString()} applied
          </p>
        </div>
        <div className="dash-sales__menu-wrap">
          <button
            type="button"
            className="dash-sales__menu-button"
            aria-label="Open apply stats period menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical aria-hidden size={22} />
          </button>
          {menuOpen && (
            <ul className="dash-sales__menu" aria-label="Apply stats periods">
              {periods.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className="dash-sales__menu-link"
                    onClick={() => {
                      setPeriod(item);
                      setMenuOpen(false);
                    }}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
      <section className="dash-sales__chart" aria-label={`${period} apply chart`}>
        <ApplyRing value={conversionPct} />
      </section>
      <footer className="dash-sales__body">
        <div className="dash-sales__legend">
          <span className="dash-sales__legend-item">
            <span className="dash-sales__dot" aria-hidden />
            Conversion ratio
          </span>
          <span className="dash-sales__legend-item">
            <span className="dash-sales__dot dash-sales__dot--muted" aria-hidden />
            Remaining pipeline
          </span>
        </div>
      </footer>
    </article>
  );
}
