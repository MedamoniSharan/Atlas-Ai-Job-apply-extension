import { Link } from 'react-router-dom';
import { Check, Sparkles, X } from 'lucide-react';

const FEATURES = [
  '4× Faster Fills',
  '1,000+ Apps / Night',
  'Browser Agent, No Manual Forms',
  'Works on Greenhouse, Workday, Ashby & more',
] as const;

function WorkdayMark() {
  return (
    <span className="hero-agent__wd" aria-hidden="true">
      <span>w</span>
    </span>
  );
}

function AgentArt() {
  return (
    <div className="hero-agent__art" aria-hidden="true">
      <svg viewBox="0 0 120 100" fill="none" className="hero-agent__art-svg">
        <path
          d="M28 18h44a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8H40l-20-20V26a8 8 0 0 1 8-8z"
          fill="url(#heroDoc)"
          opacity="0.95"
        />
        <path d="M40 78V66a8 8 0 0 0-8-8H20" fill="#c4b5fd" />
        <rect x="40" y="34" width="28" height="4" rx="2" fill="#ede9fe" />
        <rect x="40" y="44" width="22" height="4" rx="2" fill="#ede9fe" />
        <rect x="40" y="54" width="18" height="4" rx="2" fill="#ede9fe" />
        <path
          d="M78 22c10 0 18 6 18 18 0 16-18 28-18 28S60 56 60 40c0-12 8-18 18-18z"
          fill="url(#heroShield)"
          opacity="0.9"
        />
        <path
          d="M78 30c6 0 10 3.5 10 10 0 10-10 18-10 18s-10-8-10-18c0-6.5 4-10 10-10z"
          stroke="#fff"
          strokeWidth="2.5"
          fill="none"
        />
        <path
          d="M52 78c18-2 34-12 42-28"
          stroke="url(#heroArrow)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M88 44l8 6-10 2"
          stroke="#a78bfa"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="heroDoc" x1="20" y1="18" x2="90" y2="86">
            <stop stopColor="#a78bfa" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id="heroShield" x1="60" y1="22" x2="96" y2="68">
            <stop stopColor="#c4b5fd" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="heroArrow" x1="52" y1="78" x2="94" y2="50">
            <stop stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#6d28d9" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

export function HeroAutoApply() {
  return (
    <section className="hero-agent" aria-labelledby="landing-hero-title">
      <div className="hero-agent__inner">
        <div className="hero-agent__copy">
          <p className="hero-agent__badge">
            <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
            AI Powered
          </p>
          <h1 id="landing-hero-title">Auto-Apply Agent</h1>
          <ul className="hero-agent__features">
            {FEATURES.map((item) => (
              <li key={item}>
                <span className="hero-agent__check" aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-agent__visual" aria-hidden="true">
          <div className="hero-agent__panel">
            <div className="hero-agent__panel-top">
              <div className="hero-agent__brand-row">
                <WorkdayMark />
                <span>Workday</span>
              </div>
              <div className="hero-agent__status">
                <span className="hero-agent__spinner" />
                Auto-Applying...
                <X size={14} strokeWidth={2.4} />
              </div>
            </div>

            <div className="hero-agent__promo">
              <div className="hero-agent__promo-copy">
                <p className="hero-agent__promo-title">AutoApply Agent</p>
                <p className="hero-agent__promo-sub">
                  Applies to jobs while you relax.
                </p>
                <Link className="hero-agent__promo-cta" to="/register">
                  Start Applying <span aria-hidden="true">›</span>
                </Link>
              </div>
              <AgentArt />
            </div>

            <div className="hero-agent__table">
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

          <div className="hero-agent__toast">
            <span className="hero-agent__toast-icon">
              <Check size={14} strokeWidth={3} />
            </span>
            <p>
              You&apos;ve already saved <strong>20 minutes</strong>!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
