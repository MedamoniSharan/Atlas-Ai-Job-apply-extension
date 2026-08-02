import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { useHoverProgress } from '../../hooks/useHoverProgress';
import {
  DASH_PERIODS,
  type DashPeriod,
} from '../../lib/dashboardPeriod';

const ARC_LENGTH = 100;
const CX = 140;
const CY = 132;
const R = 98;
/** Gauge sweep: ~7 o'clock → 5 o'clock through the top. */
const START_DEG = 200;
const END_DEG = -20;
const SWEEP = START_DEG - END_DEG; // 220°

function polar(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(rad),
    y: CY - radius * Math.sin(rad),
  };
}

function arcPath(radius: number) {
  const s = polar(START_DEG, radius);
  const e = polar(END_DEG, radius);
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 1 1 ${e.x} ${e.y}`;
}

const TICKS = [0, 20, 40, 60, 80, 100] as const;

function MatchSpeedometer({ value }: { value: number }) {
  const maskId = useId();
  const glowId = useId();
  const { percent, durationMs, hovered, setReplay, bind } = useHoverProgress(value);
  const revealRef = useRef<SVGPathElement>(null);
  const target = Math.max(0, Math.min(100, value));
  const targetOffset = ARC_LENGTH - target;

  const ticks = useMemo(
    () =>
      TICKS.map((mark) => {
        const deg = START_DEG - (mark / 100) * SWEEP;
        const outer = polar(deg, R + 2);
        const inner = polar(deg, R - 14);
        const label = polar(deg, R - 26);
        return { mark, outer, inner, label };
      }),
    [],
  );

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
        viewBox="0 0 280 168"
        aria-hidden
      >
        <defs>
          <linearGradient id={glowId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#39ff14" stopOpacity="0.35" />
            <stop offset="45%" stopColor="#7cff4a" stopOpacity="0.85" />
            <stop offset="78%" stopColor="#b8ff4a" stopOpacity="1" />
            <stop offset="100%" stopColor="#e8ff8a" stopOpacity="1" />
          </linearGradient>
          <filter id={`${glowId}-blur`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="280"
            height="168"
          >
            <path
              ref={revealRef}
              d={arcPath(R)}
              pathLength={ARC_LENGTH}
              fill="none"
              stroke="#fff"
              strokeWidth="20"
              strokeLinecap="round"
              strokeDasharray={ARC_LENGTH}
              strokeDashoffset={targetOffset}
            />
          </mask>
        </defs>

        {/* Segmented track */}
        <path className="dash-sales__gauge-track" d={arcPath(R)} />

        {/* Soft under-glow for filled portion */}
        <path
          className="dash-sales__gauge-glow"
          d={arcPath(R)}
          stroke={`url(#${glowId})`}
          mask={`url(#${maskId})`}
        />

        {/* Solid fill */}
        <path
          className="dash-sales__gauge-progress"
          d={arcPath(R)}
          stroke={`url(#${glowId})`}
          mask={`url(#${maskId})`}
          filter={`url(#${glowId}-blur)`}
        />

        {ticks.map(({ mark, outer, inner, label }) => (
          <g key={mark}>
            <line
              className="dash-sales__gauge-tick"
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
            <text
              className="dash-sales__gauge-tick-label"
              x={label.x}
              y={label.y}
              dy="0.35em"
            >
              {mark}
            </text>
          </g>
        ))}

        <text x={CX} y={CY - 8} className="dash-sales__gauge-value">
          {percent}
        </text>
        <text x={CX} y={CY + 14} className="dash-sales__gauge-label">
          match %
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
  const unmatched = Math.max(0, scannedCount - matchedCount);

  return (
    <article className="dash-widget dash-sales">
      <header className="dash-sales__header">
        <div>
          <p className="dash-sales__eyebrow">How matched?</p>
          <h2 className="dash-sales__title">Match stats</h2>
          <p className="dash-sales__subtitle">
            <span className="dash-sales__period">{period}</span>
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

      <div className="dash-sales__wave" aria-hidden>
        <svg viewBox="0 0 280 24" preserveAspectRatio="none">
          <path d="M0 14 C 40 14, 70 14, 100 14 C 130 4, 150 4, 180 14 C 210 14, 240 14, 280 14" />
        </svg>
      </div>

      <footer className="dash-sales__body">
        <ul className="dash-sales__metrics" aria-label="Scan match breakdown">
          <li>
            <strong>{scannedCount.toLocaleString()}</strong>
            <span>Scanned</span>
          </li>
          <li>
            <strong>{matchedCount.toLocaleString()}</strong>
            <span>Matched</span>
          </li>
          <li>
            <strong>{unmatched.toLocaleString()}</strong>
            <span>Not matched</span>
          </li>
        </ul>
      </footer>
    </article>
  );
}
