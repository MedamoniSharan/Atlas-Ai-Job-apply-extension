import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicOffers, type PublicSiteOffer } from '../lib/api';

const FREEDOM_BIRD_SRC = '/events/freedom-bird.png';

function IndianFlag({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 24"
      width="30"
      height="20"
      aria-hidden
      focusable="false"
    >
      <rect width="36" height="8" y="0" fill="#FF9933" />
      <rect width="36" height="8" y="8" fill="#FFFFFF" />
      <rect width="36" height="8" y="16" fill="#138808" />
      <circle
        cx="18"
        cy="12"
        r="3.1"
        fill="none"
        stroke="#000080"
        strokeWidth="0.7"
      />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return (
          <line
            key={i}
            x1="18"
            y1="12"
            x2={18 + Math.cos(a) * 3.1}
            y2={12 + Math.sin(a) * 3.1}
            stroke="#000080"
            strokeWidth="0.35"
          />
        );
      })}
      <circle cx="18" cy="12" r="0.55" fill="#000080" />
    </svg>
  );
}

function formatSaleEndsAt(endsAt: string): string {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(end);
}

function formatSaleCountdown(endsAt: string, nowMs: number): string {
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return '';
  const remaining = end - nowMs;
  if (remaining <= 0) return 'Sale ended';

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function OfferSegment({
  offer,
  nowMs,
}: {
  offer: PublicSiteOffer;
  nowMs: number;
}) {
  const code = offer.couponCode?.trim();
  const showBird = offer.showBird !== false;
  const showFlag = offer.showFlag !== false;
  const birdSrc = offer.imageUrl?.trim() || FREEDOM_BIRD_SRC;
  const endsAt = offer.endsAt?.trim();
  const endsLabel = endsAt ? formatSaleEndsAt(endsAt) : '';
  const countdown = endsAt ? formatSaleCountdown(endsAt, nowMs) : '';

  return (
    <span className="offer-banner__segment">
      {showBird ? (
        <img
          className="offer-banner__bird"
          src={birdSrc}
          alt=""
          width={34}
          height={36}
          decoding="async"
          draggable={false}
        />
      ) : null}
      <span className="offer-banner__text">
        <span className="offer-banner__message">{offer.message}</span>
        {code ? (
          <span className="offer-banner__code">
            {' '}
            — use code <strong>{code}</strong>
          </span>
        ) : null}
        {endsAt && endsLabel ? (
          <span className="offer-banner__ends">
            {' '}
            — Sale Ends: <strong>{countdown || endsLabel}</strong>
            {countdown && countdown !== 'Sale ended' ? (
              <span className="offer-banner__ends-date"> ({endsLabel} IST)</span>
            ) : null}
          </span>
        ) : null}
      </span>
      {showFlag ? <IndianFlag className="offer-banner__flag" /> : null}
    </span>
  );
}

export function OfferTicker() {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { data: offers = [] } = useQuery({
    queryKey: ['public', 'offers'],
    queryFn: async () => {
      const res = await fetchPublicOffers();
      if (!res.success) return [];
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const hasCountdown = offers.some((o) => !!o.endsAt?.trim());

  useEffect(() => {
    if (!hasCountdown) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasCountdown]);

  if (!offers.length) return null;

  const primary = offers[0];
  const href = primary.linkUrl?.trim() || '/#pricing';
  const label = offers
    .map((o) => {
      const code = o.couponCode?.trim();
      const base = code ? `${o.message} — use code ${code}` : o.message;
      const ends = o.endsAt?.trim() ? formatSaleEndsAt(o.endsAt) : '';
      return ends ? `${base} — Sale Ends: ${ends} IST` : base;
    })
    .join('. ');

  const half = (offset: number) =>
    offers.flatMap((offer, i) =>
      Array.from({ length: Math.max(2, Math.ceil(4 / offers.length)) }, (_, j) => (
        <OfferSegment
          key={`${offset}-${i}-${j}`}
          offer={offer}
          nowMs={nowMs}
        />
      ))
    );

  return (
    <div className="offer-banner" role="region" aria-label="Current offers">
      <a href={href} className="offer-banner__link" aria-label={label}>
        <span className="offer-banner__track" aria-hidden>
          {half(0)}
          {half(1)}
        </span>
      </a>
    </div>
  );
}
