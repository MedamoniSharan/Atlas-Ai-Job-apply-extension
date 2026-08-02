import { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useHoverProgress } from '../../hooks/useHoverProgress';
import {
  DASH_PERIODS,
  type DashPeriod,
} from '../../lib/dashboardPeriod';

const ARC_LENGTH = 100;
/** Semicircle path center and radius (viewBox 220×150). */
const CX = 110;
const CY = 118;
const R = 78;

function needleAngle(pct: number): number {
  // 180° (left) → 0° (right) across the semicircle.
  const clamped = Math.max(0, Math.min(100, pct));
  return 180 - (clamped / 100) * 180;
}

function MatchSpeedometer({ value }: { value: number }) {
  const maskId = useId();
  const { percent, durationMs, hovered, setReplay, bind } = useHoverProgress(value);
  const revealRef = useRef<SVGPathElement>(null);
  const target = Math.max(0, Math.min(100, value));
  const targetOffset = ARC_LENGTH - target;
  const angle = needleAngle(percent);
  const rad = (angle * Math.PI) / 180;
  const needleLen = R - 14;
  const nx = CX + needleLen * Math.cos(rad);
  const ny = CY - needleLen * Math.sin(rad);

  useEffect(() => {
    setReplay(() => {
      const el = revealRef.current;
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
      el.style.strokeDashoffset = String(ARC_LENGTH);
      void el.getBoundingClientRect();
      el.style.transition = `stroke-dashoffset ${durationMs}ms cubic-bezier(0.45, 0, 0.2, 1)`;
      el.style.strokeDashoffset = String(targetOffset);
    });
    return () => setReplay(null);
  }, [durationMs, setReplay, targetOffset]);

  useEffect(() => {
    const el = revealRef.current;
    if (!el || hovered) return;
    el.style.transition = 'none';
    el.style.strokeDashoffset = String(targetOffset);
  }, [hovered, targetOffset]);

  return (
    <div
      className="dash-sales__gauge"
      role="img"
      tabIndex={0}
      aria-label={`Match rate ${value}%`}
      {...bind}
    >
      <svg
        className="dash-sales__gauge-svg"
        viewBox="0 0 220 150"
        aria-hidden
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="220"
            height="150"
          >
            <path
              ref={revealRef}
              d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
              pathLength={ARC_LENGTH}
              fill="none"
              stroke="#fff"
              strokeWidth="16"
              strokeLinecap="butt"
              strokeDasharray={ARC_LENGTH}
              strokeDashoffset={targetOffset}
            />
          </mask>
        </defs>
        <path
          className="dash-sales__gauge-track"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          pathLength={ARC_LENGTH}
        />
        <path
          className="dash-sales__gauge-progress"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          mask={`url(#${maskId})`}
        />
        <line
          className="dash-sales__gauge-needle"
          x1={CX}
          y1={CY}
          x2={nx}
          y2={ny}
        />
        <circle className="dash-sales__gauge-hub" cx={CX} cy={CY} r="3.5" />
        <text x={CX} y={CY - 38} className="dash-sales__gauge-value">
          {percent}%
        </text>
        <text x={CX} y={CY - 18} className="dash-sales__gauge-label">
          Matched
        </text>
      </svg>
    </div>
  );
}

export interface SalesStatsCardProps {
  period: DashPeriod;
  onPeriodChange: (period: DashPeriod) => void;
  scannedCount: number;
  matchedCount: number;
}

export function SalesStatsCard({
  period,
  onPeriodChange,
  scannedCount,
  matchedCount,
}: SalesStatsCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const matchRate =
    scannedCount > 0
      ? Math.min(100, Math.round((matchedCount / scannedCount) * 100))
      : 0;

  return (
    <article className="dash-widget dash-sales">
      <header className="dash-sales__header">
        <div>
          <h2 className="dash-sales__title">Match stats</h2>
          <p className="dash-sales__subtitle">
            {scannedCount.toLocaleString()} scanned ·{' '}
            {matchedCount.toLocaleString()} matched
            <span className="dash-sales__period"> · {period}</span>
          </p>
        </div>
        <div className="dash-sales__menu-wrap">
          <button
            type="button"
            className="dash-sales__menu-button"
            aria-label="Open match stats period menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical aria-hidden size={22} />
          </button>
          {menuOpen && (
            <ul className="dash-sales__menu" aria-label="Match stats periods">
              {DASH_PERIODS.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className="dash-sales__menu-link"
                    onClick={() => {
                      onPeriodChange(item);
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
      <section className="dash-sales__chart" aria-label={`${period} match speedometer`}>
        <MatchSpeedometer value={matchRate} />
      </section>
      <footer className="dash-sales__body">
        <div className="dash-sales__legend">
          <span className="dash-sales__legend-item">
            <span className="dash-sales__dot" aria-hidden />
            Matched
          </span>
          <span className="dash-sales__legend-item">
            <span className="dash-sales__dot dash-sales__dot--muted" aria-hidden />
            Not matched
          </span>
        </div>
      </footer>
    </article>
  );
}
