import { useMemo, useState } from 'react';
import { ChevronDown, Gauge, Target } from 'lucide-react';

const PERIODS = ['This month', 'Last month', 'This year'] as const;

export interface GrowthRadialCardProps {
  usagePct: number;
  applyRate: number;
  usage: number;
  usageLimit: number;
  appliedCount: number;
  jobsCount: number;
}

export function GrowthRadialCard({
  usagePct,
  applyRate,
  usage,
  usageLimit,
  appliedCount,
  jobsCount,
}: GrowthRadialCardProps) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0]);
  const [isOpen, setIsOpen] = useState(false);

  const progressPath = useMemo(() => {
    // Semi-circle arc: map 0–100% onto an open path approximating the demo chart.
    const clamped = Math.max(0, Math.min(100, usagePct));
    if (clamped <= 0) return 'M 38 130';
    if (clamped >= 100) return 'M 38 130 A 72 72 0 1 1 182 130';
    // Approximate endpoint along the arc for mid values (visual only).
    const angle = Math.PI * (1 - clamped / 100);
    const x = 110 + 72 * Math.cos(angle);
    const y = 130 - 72 * Math.sin(angle);
    const large = clamped > 50 ? 1 : 0;
    return `M 38 130 A 72 72 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, [usagePct]);

  return (
    <article className="dash-widget dash-growth" aria-labelledby="growth-card-title">
      <header className="dash-growth__picker-wrap">
        <div className="dash-growth__picker" role="group" aria-label="Select period">
          <button
            type="button"
            className="dash-growth__year-btn dash-growth__year-btn--main"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span>{period}</span>
          </button>
          <button
            type="button"
            className="dash-growth__year-btn dash-growth__year-btn--toggle"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label="Open period menu"
            onClick={() => setIsOpen((open) => !open)}
          >
            <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
          </button>
          {isOpen && (
            <ul className="dash-growth__menu" role="listbox" aria-label="Available periods">
              {PERIODS.map((item) => (
                <li key={item} role="option" aria-selected={period === item}>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriod(item);
                      setIsOpen(false);
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

      <section className="dash-growth__radial" aria-label="Usage chart">
        <div className="dash-growth__chart">
          <svg
            viewBox="0 0 220 170"
            role="img"
            aria-labelledby="growth-card-title growth-chart-description"
          >
            <title id="growth-card-title">Apply usage</title>
            <desc id="growth-chart-description">
              A radial progress chart showing {usagePct} percent of monthly applies used.
            </desc>
            <path className="dash-growth__track" d="M 38 130 A 72 72 0 1 1 182 130" />
            <path className="dash-growth__progress" d={progressPath} />
            <text x="110" y="108" className="dash-growth__value">
              {usagePct}%
            </text>
            <text x="110" y="130" className="dash-growth__label">
              Usage
            </text>
          </svg>
        </div>
      </section>

      <p className="dash-growth__company">{applyRate}% apply rate</p>

      <section className="dash-growth__stats" aria-label="Usage and pipeline">
        <div className="dash-growth__stat">
          <div className="dash-growth__icon dash-growth__icon--primary" aria-hidden>
            <Gauge size={18} strokeWidth={2.4} />
          </div>
          <div className="dash-growth__copy">
            <small>Applies used</small>
            <strong>
              {usage}
              {usageLimit > 0 ? ` / ${usageLimit}` : ''}
            </strong>
          </div>
        </div>
        <div className="dash-growth__stat">
          <div className="dash-growth__icon dash-growth__icon--info" aria-hidden>
            <Target size={18} strokeWidth={2.3} />
          </div>
          <div className="dash-growth__copy">
            <small>Pipeline</small>
            <strong>
              {appliedCount} / {jobsCount}
            </strong>
          </div>
        </div>
      </section>
    </article>
  );
}
