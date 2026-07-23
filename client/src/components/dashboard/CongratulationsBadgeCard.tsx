import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

export interface CongratulationsBadgeCardProps {
  name?: string;
  matchedCount?: number;
  appliedCount?: number;
  ctaLabel?: string;
  ctaTo?: string;
  onCtaClick?: () => void;
  imageSrc?: string;
  imageAlt?: string;
}

export function CongratulationsBadgeCard({
  name = 'there',
  matchedCount = 0,
  appliedCount = 0,
  ctaLabel = 'View applications',
  ctaTo = '/applications',
  onCtaClick,
  imageSrc = 'https://demos.themeselection.com/sneat-bootstrap-html-admin-template/assets/img/illustrations/man-with-laptop.png',
  imageAlt = 'Person reviewing job matches on a laptop',
}: CongratulationsBadgeCardProps) {
  const handleCta = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onCtaClick) {
      event.preventDefault();
      onCtaClick();
    }
  };

  return (
    <article
      className="dash-widget dash-congrats"
      aria-labelledby="congratulations-card-title"
    >
      <section className="dash-congrats__copy">
        <h2 id="congratulations-card-title">
          Congratulations {name}!{' '}
          <span aria-hidden="true">🎉</span>
        </h2>
        <p className="dash-congrats__summary">
          <span className="dash-congrats__metric">
            <span className="dash-congrats__stat">{matchedCount}</span>
            <span className="dash-congrats__metric-label">matched jobs</span>
          </span>
          <span className="dash-congrats__sep" aria-hidden>
            ·
          </span>
          <span className="dash-congrats__metric">
            <span className="dash-congrats__stat">{appliedCount}</span>
            <span className="dash-congrats__metric-label">applications tracked</span>
          </span>
        </p>
        <p className="dash-congrats__hint">
          Keep the co-pilot running to grow your pipeline.
        </p>
        <Link
          to={ctaTo}
          className="dash-congrats__cta"
          onClick={handleCta}
        >
          {ctaLabel}
        </Link>
      </section>
      <figure className="dash-congrats__figure">
        <img src={imageSrc} height={175} width={220} alt={imageAlt} />
      </figure>
    </article>
  );
}
