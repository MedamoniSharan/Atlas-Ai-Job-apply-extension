import { Link } from 'react-router-dom';
import { Check, Sparkles, X } from 'lucide-react';

const FEATURES = [
  '4× Faster Fills',
  '1,000+ Apps / Night',
  'Browser Agent, No Manual Forms',
  'Works on Greenhouse, Workday, Ashby & more',
] as const;

const PROMO_ART = '/hero-promo-card.png?v=10';
const NAUKRI_LOGO = '/naukri-logo.png';

function NaukriMark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="hero-agent__naukri"
      src={NAUKRI_LOGO}
      alt=""
      width={size}
      height={size}
      decoding="async"
      aria-hidden="true"
    />
  );
}

function MicrosoftMark() {
  return (
    <svg
      className="hero-agent__microsoft"
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 23 23"
      role="img"
    >
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function HeroAutoApply() {
  return (
    <section className="hero-agent" aria-labelledby="landing-hero-title">
      <div className="hero-agent__inner">
        <div className="hero-agent__copy">
          <p className="hero-agent__badge">
            <Sparkles
              size={14}
              strokeWidth={2}
              className="hero-agent__badge-spark icon-motion icon-motion--spin-slow"
              aria-hidden
            />
            AI Powered
          </p>
          <h1 id="landing-hero-title" className="hero-agent__title">
            <NaukriMark size={36} />
            <span>Naukri Auto Apply</span>
          </h1>
          <ul className="hero-agent__features">
            {FEATURES.map((item) => (
              <li key={item}>
                <Check
                  size={16}
                  strokeWidth={2.4}
                  className="hero-agent__check icon-motion"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-agent__visual">
          <div className="hero-agent__panel">
            <div className="hero-agent__panel-top">
              <div className="hero-agent__brand-row">
                <MicrosoftMark />
                <span>Microsoft</span>
              </div>
              <div className="hero-agent__status">
                <span className="hero-agent__spinner" />
                Auto-Applying…
                <X size={14} strokeWidth={2.4} aria-hidden="true" />
              </div>
            </div>

            <Link
              className="hero-agent__promo"
              to="/login"
              aria-label="Start applying — sign in"
            >
              <img
                className="hero-agent__promo-img"
                src={PROMO_ART}
                alt="AutoApply Agent — applies to jobs while you relax"
                width={700}
                height={178}
                decoding="async"
              />
            </Link>

            <div className="hero-agent__table" aria-hidden="true">
              <div className="hero-agent__table-head">
                <span>Role</span>
                <span>Company</span>
                <span>Status</span>
              </div>
              <div className="hero-agent__table-row">
                <span>Software Developer</span>
                <span>Apple</span>
                <span className="hero-agent__applied">Applied</span>
              </div>
              <div className="hero-agent__table-row">
                <span>UX Designer</span>
                <span>Google</span>
                <span className="hero-agent__applied">Applied</span>
              </div>
            </div>
          </div>

          <div className="hero-agent__toast" role="status">
            <span className="hero-agent__toast-icon" aria-hidden="true">
              <Check size={14} strokeWidth={2.6} />
            </span>
            <p>
              You’ve already saved <strong>20 minutes!</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
