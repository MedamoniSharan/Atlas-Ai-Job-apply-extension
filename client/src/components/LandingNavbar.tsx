import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { CosmosMark } from './CosmosLogo';

const CHROME_STORE_URL = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '';

const featureItems = [
  {
    title: 'AI Job Application',
    description: 'Auto-apply with personalized resumes & cover letters',
    href: '#get-extension',
  },
  {
    title: 'AI Resume Builder',
    description: 'ATS-optimized resumes tailored to every job',
    href: '#get-extension',
  },
  {
    title: 'AI Cover Letter Generator',
    description: 'Job-specific cover letters in 30 seconds',
    href: '#get-extension',
  },
  {
    title: 'ATS Resume Checker',
    description: 'Score your resume across 24+ ATS criteria',
    href: '#get-extension',
  },
] as const;

const moreItems = [
  { title: 'Get Extension', href: '#get-extension' },
  { title: 'Sign up', href: '/register' },
  { title: 'Log in', href: '/login' },
] as const;

const contactItems = [
  { title: 'Support', href: 'mailto:hello@cosmovai.com' },
  { title: 'Get Extension', href: '#get-extension' },
] as const;

type MenuKey = 'features' | 'more' | 'contact' | null;

function ChromeGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 190.5 190.5"
      aria-hidden="true"
    >
      <path
        fill="#fff"
        d="M95.252 142.873c26.304 0 47.627-21.324 47.627-47.628s-21.323-47.628-47.627-47.628-47.627 21.324-47.627 47.628 21.323 47.628 47.627 47.628z"
      />
      <path
        fill="#229342"
        d="m54.005 119.07-41.24-71.43a95.227 95.227 0 0 0-.003 95.25 95.234 95.234 0 0 0 82.496 47.61l41.24-71.43v-.011a47.613 47.613 0 0 1-17.428 17.443 47.62 47.62 0 0 1-47.632.007 47.62 47.62 0 0 1-17.433-17.437z"
      />
      <path
        fill="#fbc116"
        d="m136.495 119.067-41.239 71.43a95.229 95.229 0 0 0 82.489-47.622A95.24 95.24 0 0 0 190.5 95.248a95.237 95.237 0 0 0-12.772-47.623H95.249l-.01.007a47.62 47.62 0 0 1 23.819 6.372 47.618 47.618 0 0 1 17.439 17.431 47.62 47.62 0 0 1-.001 47.633z"
      />
      <path
        fill="#1a73e8"
        d="M95.252 132.961c20.824 0 37.705-16.881 37.705-37.706S116.076 57.55 95.252 57.55 57.547 74.431 57.547 95.255s16.881 37.706 37.705 37.706z"
      />
      <path
        fill="#e33b2e"
        d="M95.252 47.628h82.479A95.237 95.237 0 0 0 142.87 12.76 95.23 95.23 0 0 0 95.245 0a95.222 95.222 0 0 0-47.623 12.767 95.23 95.23 0 0 0-34.856 34.872l41.24 71.43.011.006a47.62 47.62 0 0 1-.015-47.633 47.61 47.61 0 0 1 41.252-23.815z"
      />
    </svg>
  );
}

function BrandMark() {
  return <CosmosMark />;
}

export function LandingNavbar() {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const extensionHref = CHROME_STORE_URL || '/register';
  const extensionExternal = Boolean(CHROME_STORE_URL);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!navRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function toggleMenu(key: MenuKey) {
    setOpenMenu((prev) => (prev === key ? null : key));
  }

  return (
    <header className="capsule-shell">
      <nav className="capsule-nav" aria-label="Main navigation" ref={navRef}>
        <Link className="capsule-brand" to="/" aria-label="Cosmo home">
          <BrandMark />
        </Link>

        <div className="capsule-links">
          <a className="capsule-link" href="#top">
            Home
          </a>
          <a className="capsule-link" href="#pricing">
            Pricing
          </a>

          <div className="capsule-dd">
            <button
              type="button"
              className={`capsule-link capsule-link--btn${openMenu === 'features' ? ' is-open' : ''}`}
              aria-expanded={openMenu === 'features'}
              aria-controls="capsule-features-menu"
              onClick={() => toggleMenu('features')}
            >
              Features
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {openMenu === 'features' ? (
              <div id="capsule-features-menu" className="capsule-menu" role="menu">
                {featureItems.map((item) => (
                  <a
                    key={item.title}
                    className="capsule-menu__link"
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpenMenu(null)}
                  >
                    <span className="capsule-menu__title">{item.title}</span>
                    <span className="capsule-menu__desc">{item.description}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="capsule-dd">
            <button
              type="button"
              className={`capsule-link capsule-link--btn${openMenu === 'more' ? ' is-open' : ''}`}
              aria-expanded={openMenu === 'more'}
              aria-controls="capsule-more-menu"
              onClick={() => toggleMenu('more')}
            >
              More
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {openMenu === 'more' ? (
              <div id="capsule-more-menu" className="capsule-menu capsule-menu--sm" role="menu">
                {moreItems.map((item) => (
                  <a
                    key={item.title}
                    className="capsule-menu__link"
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpenMenu(null)}
                  >
                    <span className="capsule-menu__title">{item.title}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="capsule-dd">
            <button
              type="button"
              className={`capsule-link capsule-link--btn${openMenu === 'contact' ? ' is-open' : ''}`}
              aria-expanded={openMenu === 'contact'}
              aria-controls="capsule-contact-menu"
              onClick={() => toggleMenu('contact')}
            >
              Contact
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {openMenu === 'contact' ? (
              <div id="capsule-contact-menu" className="capsule-menu capsule-menu--sm" role="menu">
                {contactItems.map((item) => (
                  <a
                    key={item.title}
                    className="capsule-menu__link"
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpenMenu(null)}
                  >
                    <span className="capsule-menu__title">{item.title}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="capsule-actions">
          <a
            className="capsule-ext"
            href={extensionHref}
            {...(extensionExternal
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : {})}
          >
            <ChromeGlyph />
            Get Extension
          </a>
          <Link className="capsule-login" to="/login">
            Log in
          </Link>
          <Link className="capsule-signup" to="/register">
            Sign up
          </Link>
        </div>

        <div className="capsule-mobile-actions">
          <Link className="capsule-signup capsule-signup--sm" to="/register">
            Sign up
          </Link>
          <button
            type="button"
            className="capsule-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X size={22} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="capsule-drawer">
          <a href="#top" onClick={() => setMenuOpen(false)}>
            Home
          </a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>
            Pricing
          </a>
          <p className="capsule-drawer__label">Features</p>
          {featureItems.map((item) => (
            <a key={item.title} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.title}
            </a>
          ))}
          <p className="capsule-drawer__label">More</p>
          {moreItems.map((item) => (
            <a key={item.title} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.title}
            </a>
          ))}
          <a
            href={extensionHref}
            onClick={() => setMenuOpen(false)}
            {...(extensionExternal
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : {})}
          >
            Get Extension
          </a>
          <Link to="/login" onClick={() => setMenuOpen(false)}>
            Log in
          </Link>
        </div>
      ) : null}
    </header>
  );
}
