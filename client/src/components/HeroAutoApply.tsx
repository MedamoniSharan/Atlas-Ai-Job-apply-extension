import { Link } from 'react-router-dom';
import { Check, Sparkles, X } from 'lucide-react';

const FEATURES = [
  '4× Faster Fills',
  '1,000+ Apps / Night',
  'Browser Agent, No Manual Forms',
  'Works on Greenhouse, Workday, Ashby & more',
] as const;

const PROMO_ART = '/A6sNEgPCIIfX9ATPDrQVd1r4PU.avif';
const TOAST_ART = '/XAkCgccIBX2KJG3BPQ1pP7Vfeu8.avif';

function WorkdayMark() {
  return (
    <span className="hero-agent__wd" aria-hidden="true">
      <span>w</span>
    </span>
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
          <h1 id="landing-hero-title">Auto-Apply Agent</h1>
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
                <WorkdayMark />
                <span>Workday</span>
              </div>
              <div className="hero-agent__status">
                <span className="hero-agent__spinner" />
                Auto-Applying...
                <X size={14} strokeWidth={2.4} aria-hidden="true" />
              </div>
            </div>

            <Link
              className="hero-agent__promo"
              to="/register"
              aria-label="Start applying with AutoApply Agent"
            >
              <img
                className="hero-agent__promo-img"
                src={PROMO_ART}
                alt="AutoApply Agent — applies to jobs while you relax. Start Applying."
                width={720}
                height={280}
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

          <img
            className="hero-agent__toast-img"
            src={TOAST_ART}
            alt="You've already saved 20 minutes!"
            width={360}
            height={80}
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
