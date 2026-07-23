import { useState } from 'react';
import { ArrowUp, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';

const chartPoints = [
  { x: 0, y: 61 },
  { x: 42, y: 10 },
  { x: 84, y: 49 },
  { x: 126, y: 18 },
  { x: 168, y: 32 },
  { x: 210, y: 6 },
];

const chartPath =
  'M 0 61 C 15 61 27 10 42 10 C 57 10 69 49 84 49 C 99 49 111 18 126 18 C 141 18 153 32 168 32 C 183 32 195 6 210 6';

export interface ProfileReportCardProps {
  matchRate: number;
  jobsCount: number;
  yearLabel?: string;
}

export function ProfileReportCard({
  matchRate,
  jobsCount,
  yearLabel = `YEAR ${new Date().getFullYear()}`,
}: ProfileReportCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <article
      className="dash-widget dash-report"
      aria-labelledby="profile-report-title"
    >
      <header className="dash-report__header">
        <div className="dash-report__heading">
          <div className="dash-report__title-row">
            <h2 id="profile-report-title">Match report</h2>
            <span className="dash-report__badge">{yearLabel}</span>
          </div>
          <div className="dash-report__values">
            <p className="dash-report__growth">
              <ArrowUp aria-hidden size={18} strokeWidth={2.5} />
              <span>{matchRate}%</span>
            </p>
            <p className="dash-report__total">{jobsCount.toLocaleString()} jobs</p>
          </div>
        </div>
        <div className="dash-report__actions">
          <button
            className="dash-report__more"
            type="button"
            aria-label="Open report options"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <MoreHorizontal aria-hidden size={20} />
          </button>
          {isMenuOpen && (
            <div className="dash-report__menu" role="menu">
              <Link
                to="/applications"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
              >
                View applications
              </Link>
              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
              >
                Preferences
              </Link>
            </div>
          )}
        </div>
      </header>
      <figure className="dash-report__chart" aria-label="Match report trend chart">
        <svg
          viewBox="0 0 210 70"
          role="img"
          aria-labelledby="dash-report-chart-title dash-report-chart-desc"
          preserveAspectRatio="none"
        >
          <title id="dash-report-chart-title">Match report trend</title>
          <desc id="dash-report-chart-desc">
            A six-point line rising overall, with a few alternating peaks and dips.
          </desc>
          <path className="dash-report__shadow" d={chartPath} />
          <path className="dash-report__line" d={chartPath} />
          {chartPoints.map((point) => (
            <circle
              key={`${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r="2.2"
              className="dash-report__point"
            />
          ))}
        </svg>
        <figcaption>Match quality trend</figcaption>
      </figure>
    </article>
  );
}
