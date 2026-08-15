import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { fetchLeaderboard } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { breadcrumbJsonLd, webPageJsonLd } from '../lib/jsonLd';
import { useAuthStore } from '../store/authStore';
import { LeaderboardPodium } from '../components/leaderboard/LeaderboardPodium';
import '../styles/landing-fonts.css';

const PAGE_DESCRIPTION =
  'See who is applying the most with Cosmo. Top contests ranked by successful job applications.';

type Period = 'month' | 'last_month' | 'year' | 'all';
type PlatformFilter =
  | 'all'
  | 'naukri'
  | 'linkedin'
  | 'foundit'
  | 'indeed'
  | 'wellfound'
  | 'internshala';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const PLATFORM_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: 'all', label: 'All platforms' },
  { value: 'naukri', label: 'Naukri' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'foundit', label: 'Foundit' },
  { value: 'indeed', label: 'Indeed' },
  { value: 'wellfound', label: 'Wellfound' },
  { value: 'internshala', label: 'Internshala' },
];

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toLocaleString('en-IN');
}

function formatPoints(n: number): string {
  return `${n.toLocaleString('en-IN')} pts`;
}

function platformLabel(platform: string): string {
  if (platform === 'naukri') return 'Naukri';
  if (platform === 'linkedin') return 'LinkedIn';
  if (platform === 'foundit') return 'Foundit';
  if (platform === 'indeed') return 'Indeed';
  if (platform === 'wellfound') return 'Wellfound';
  if (platform === 'internshala') return 'Internshala';
  return platform;
}

function Sparkline({
  values,
  tone = 'teal',
}: {
  values: number[];
  tone?: 'teal' | 'gold' | 'violet';
}) {
  const width = 72;
  const height = 28;
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      className={`lb-spark lb-spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline points={points} fill="none" strokeWidth="2" />
    </svg>
  );
}

function MetricCell({
  total,
  change,
  trend,
  tone = 'teal',
}: {
  total: number;
  change: number;
  trend: number[];
  tone?: 'teal' | 'gold' | 'violet';
}) {
  const up = change >= 0;
  return (
    <div className="lb-metric">
      <Sparkline values={trend} tone={tone} />
      <div className="lb-metric__values">
        <span className={`lb-metric__delta lb-metric__delta--${up ? 'up' : 'down'}`}>
          {up ? '↑' : '↓'} {formatCompact(Math.abs(change))}
        </span>
        <span className="lb-metric__total">{formatCompact(total)}</span>
      </div>
    </div>
  );
}

function LeaderboardView({ shellClass = 'dash lb' }: { shellClass?: string }) {
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<Period>('month');
  const [platform, setPlatform] = useState<PlatformFilter>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaderboard', period, platform],
    queryFn: async () => {
      const res = await fetchLeaderboard({ period, platform });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 60_000,
  });

  const top3 = useMemo(() => data?.entries.slice(0, 3) ?? [], [data]);

  if (isLoading) {
    return (
      <div className={`${shellClass} lb--loading`}>
        <CosmosLoader label="Loading leaderboard…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={shellClass}>
        <div className="lb-empty">Could not load the leaderboard. Try again shortly.</div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {data.currentUserRank ? (
        <p className="lb-you-rank">
          Your rank: <strong>#{data.currentUserRank}</strong>
        </p>
      ) : !user ? (
        <p className="lb-you-rank">
          <Link to="/login?next=%2Fleaderboard">Log in</Link> to see your rank.
        </p>
      ) : null}

      {top3.length > 0 ? <LeaderboardPodium entries={top3} /> : null}

      <section className="lb-table-wrap">
        <div className="lb-filters">
          <label className="lb-filter">
            <span>Top ranked</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden className="lb-filter__chev" />
          </label>
          <label className="lb-filter">
            <span>Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformFilter)}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden className="lb-filter__chev" />
          </label>
          <span className="lb-filters__meta">
            Showing top {data.entries.length} · {data.period.label}
          </span>
        </div>

        <div className="lb-table-scroll">
          <table className="lb-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">User</th>
                <th scope="col">Platform</th>
                <th scope="col">Applied</th>
                <th scope="col">Matched</th>
                <th scope="col">Scanned</th>
                <th scope="col">Cosmo Points</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr
                  key={entry.rank}
                  className={entry.isYou ? 'lb-table__row--you' : undefined}
                >
                  <td className="lb-table__rank">#{entry.rank}</td>
                  <td className="lb-table__user">
                    <span className="lb-table__avatar" aria-hidden>
                      {entry.initials}
                    </span>
                    <span className="lb-table__identity">
                      <strong>{entry.displayName}</strong>
                      <span>{entry.handle}</span>
                    </span>
                  </td>
                  <td className="lb-table__platform">
                    <span className="lb-table__platform-badge">
                      {platformLabel(entry.platform)}
                    </span>
                  </td>
                  <td>
                    <MetricCell
                      total={entry.applied}
                      change={entry.change.applied}
                      trend={entry.trends.applied}
                      tone="teal"
                    />
                  </td>
                  <td>
                    <MetricCell
                      total={entry.matched}
                      change={entry.change.matched}
                      trend={entry.trends.matched}
                      tone="gold"
                    />
                  </td>
                  <td>
                    <MetricCell
                      total={entry.scanned}
                      change={entry.change.scanned}
                      trend={entry.trends.scanned}
                      tone="violet"
                    />
                  </td>
                  <td className="lb-table__points">
                    <span className="lb-table__coin" aria-hidden />
                    {formatPoints(entry.points)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.entries.length === 0 ? (
          <p className="lb-empty">
            No applications recorded for this period yet. Be the first on the board!
          </p>
        ) : null}

        {data.entries.length > 0 ? (
          <p className="lb-footnote">Top 10 applicants · updated live</p>
        ) : null}
      </section>
    </div>
  );
}

/** Logged-in leaderboard inside the app shell. */
export function LeaderboardPage() {
  return <LeaderboardView />;
}

/** Guest top contests page from the marketing navbar. */
export function PublicLeaderboardPage() {
  return (
    <div className="landing leaderboard-public">
      <SeoHead
        title="Top contests"
        description={PAGE_DESCRIPTION}
        path="/leaderboard"
        jsonLd={[
          webPageJsonLd({
            name: 'Top contests — Cosmo',
            description: PAGE_DESCRIPTION,
            path: '/leaderboard',
          }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Top contests', path: '/leaderboard' },
          ]),
        ]}
      />
      <LandingNavbar />
      <main className="leaderboard-public__main">
        <LeaderboardView shellClass="lb" />
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
