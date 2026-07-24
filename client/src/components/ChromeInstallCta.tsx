import { ArrowRight, Puzzle } from 'lucide-react';

const CHROME_STORE_URL = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '';

function ChromeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.6" fill="currentColor" />
      <path
        d="M12 2a10 10 0 0 1 8.66 5H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20.66 7A10 10 0 0 1 15.5 20.3L12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M15.5 20.3A10 10 0 0 1 3.34 7H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChromeInstallCta() {
  const href = CHROME_STORE_URL || '/register';
  const external = Boolean(CHROME_STORE_URL);

  return (
    <section className="chrome-cta" aria-labelledby="chrome-cta-title">
      <h2 id="chrome-cta-title" className="chrome-cta__title">
        Ready to transform{' '}
        <span className="chrome-cta__gradient">your job search?</span>
      </h2>
      <p className="chrome-cta__sub">
        Install the Cosmo co-pilot for Naukri and sync applications to your
        dashboard.
      </p>
      <a
        className="chrome-cta__btn"
        href={href}
        {...(external
          ? { target: '_blank', rel: 'noreferrer noopener' }
          : {})}
      >
        <ChromeIcon />
        <span>Add to Chrome — Free</span>
        <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
      </a>
      <div className="chrome-cta__meta">
        <span>
          <Puzzle size={14} strokeWidth={2} aria-hidden="true" />
          Free to install
        </span>
        <span>Naukri co-pilot</span>
      </div>
    </section>
  );
}
