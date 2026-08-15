import { useState, type CSSProperties } from 'react';

export type PodiumEntry = {
  rank: number;
  displayName: string;
  initials: string;
  points: number;
  applied: number;
  isYou?: boolean;
};

type PodiumTone = 'silver' | 'gold' | 'bronze';

type PodiumWinner = PodiumEntry & {
  tone: PodiumTone;
  height: string;
};

function medalIcon(tone: PodiumTone) {
  const fills = {
    gold: ['#f6e05e', '#d97706'],
    silver: ['#e5e7eb', '#9ca3af'],
    bronze: ['#fcd9c2', '#b45309'],
  } as const;
  const [a, b] = fills[tone];
  return (
    <svg className="podium-shell__badge" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="9" r="6" fill={a} stroke={b} strokeWidth="1.2" />
      <path
        d="M8.5 14.5 7 21l5-2.5L17 21l-1.5-6.5"
        fill="none"
        stroke={b}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toWinners(entries: PodiumEntry[]): PodiumWinner[] {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));
  const ordered: Array<{ rank: 1 | 2 | 3; tone: PodiumTone; height: string }> = [
    { rank: 2, tone: 'silver', height: '152px' },
    { rank: 1, tone: 'gold', height: '168px' },
    { rank: 3, tone: 'bronze', height: '144px' },
  ];

  return ordered.flatMap(({ rank, tone, height }) => {
    const entry = byRank.get(rank);
    if (!entry) return [];
    return [{ ...entry, tone, height }];
  });
}

function formatScore(points: number): string {
  return points.toLocaleString('en-IN');
}

export function LeaderboardPodium({ entries }: { entries: PodiumEntry[] }) {
  const winners = toWinners(entries.slice(0, 3));
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  if (winners.length === 0) return null;

  return (
    <section className="podium-shell" aria-label="Top leaderboard performers">
      {winners.map((winner) => (
        <button
          type="button"
          key={winner.rank}
          className="podium-shell__link"
          aria-label={`${winner.displayName}, ${formatScore(winner.points)} points`}
          aria-pressed={selectedRank === winner.rank}
          onClick={() =>
            setSelectedRank((current) =>
              current === winner.rank ? null : winner.rank
            )
          }
        >
          <article
            className={`podium-shell__card${
              selectedRank === winner.rank ? ' is-selected' : ''
            }${winner.isYou ? ' is-you' : ''}`}
            style={{ '--height': winner.height } as CSSProperties}
          >
            <div className="podium-shell__visual">
              {medalIcon(winner.tone)}
              <div className={`podium-shell__avatar-ring tone-${winner.tone}`}>
                <span className="podium-shell__avatar" aria-hidden>
                  {winner.initials}
                </span>
              </div>
              <div className="podium-shell__stem" aria-hidden />
              <div className="podium-shell__base" aria-hidden />
            </div>
            <div className="podium-shell__info">
              <div className="podium-shell__name-row">
                <span
                  className={`podium-shell__name${
                    winner.tone === 'gold' ? ' podium-shell__name--gold' : ''
                  }`}
                >
                  {winner.displayName}
                </span>
              </div>
              <div className="podium-shell__score">{formatScore(winner.points)} pts</div>
              <div className="podium-shell__applied">
                {winner.applied.toLocaleString('en-IN')} applied
              </div>
            </div>
          </article>
        </button>
      ))}
    </section>
  );
}
