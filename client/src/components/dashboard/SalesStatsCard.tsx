import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useHoverProgress } from '../../hooks/useHoverProgress';

const periods = ['Last 28 Days', 'Last Month', 'Last Year'] as const;

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

function ApplyRing({ value }: { value: number }) {
  const { percent, durationMs, hovered, setReplay, bind } = useHoverProgress(value);
  const progressRef = useRef<SVGCircleElement>(null);
  const target = Math.max(0, Math.min(100, value));
  const targetOffset = RING_C * (1 - target / 100);

  useEffect(() => {
    setReplay(() => {
      const el = progressRef.current;
      if (!el) return;

      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        el.style.transition = 'none';
        el.style.strokeDashoffset = String(targetOffset);
        return;
      }

      el.style.transition = 'none';
      el.style.strokeDashoffset = String(RING_C);
      // Force layout so the next transition starts from 0.
      void el.getBoundingClientRect();
      el.style.transition = `stroke-dashoffset ${durationMs}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      el.style.strokeDashoffset = String(targetOffset);
    });
    return () => setReplay(null);
  }, [durationMs, setReplay, targetOffset]);

  useEffect(() => {
    const el = progressRef.current;
    if (!el || hovered) return;
    el.style.transition = 'none';
    el.style.strokeDashoffset = String(targetOffset);
  }, [hovered, targetOffset]);

  return (
    <div
      className="dash-sales__ring"
      role="img"
      tabIndex={0}
      aria-label={`Apply conversion ratio ${value}%`}
      {...bind}
    >
      <svg className="dash-sales__ring-svg" viewBox="0 0 100 100" aria-hidden>
        <circle
          className="dash-sales__ring-track"
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
        />
        <circle
          ref={progressRef}
          className="dash-sales__ring-progress"
          cx="50"
          cy="50"
          r={RING_R}
          fill="none"
          strokeDasharray={RING_C}
          strokeDashoffset={targetOffset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="dash-sales__ring-inner">
        <strong>{percent}%</strong>
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
