import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { CosmosMark } from './CosmosLogo';
import { communityLinks } from '../content/communityLinks';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';

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
  const [communityOpen, setCommunityOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const extensionHref = CHROME_EXTENSION_URL;

  function goHome() {
    setMenuOpen(false);
    setCommunityOpen(false);
    if (location.pathname === '/') {
      const top = document.getElementById('top');
      if (top) {
        top.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!navRef.current?.contains(e.target as Node)) {
        setCommunityOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCommunityOpen(false);
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

  return (
    <header className="capsule-shell">
      <nav className="capsule-nav" aria-label="Main navigation" ref={navRef}>
        <Link className="capsule-brand" to="/" aria-label="Cosmo home">
          <BrandMark />
        </Link>

        <div className="capsule-links">
          <Link className="capsule-link" to="/" onClick={goHome}>
            Home
          </Link>
          <Link
            className="capsule-link capsule-link--hiring"
            to="/companies"
            aria-label="Companies, Hiring"
          >
            <span>Companies</span>
            <span className="capsule-hiring-badge">Hiring</span>
          </Link>
          <a className="capsule-link" href="#pricing">
            Pricing
          </a>

          <div
            className="capsule-dd"
            onMouseEnter={() => setCommunityOpen(true)}
            onMouseLeave={() => setCommunityOpen(false)}
          >
            <button
              type="button"
              className={`capsule-link capsule-link--btn${communityOpen ? ' is-open' : ''}`}
              aria-expanded={communityOpen}
              aria-controls="capsule-community-menu"
              onClick={() => setCommunityOpen((open) => !open)}
              onFocus={() => setCommunityOpen(true)}
            >
              Community
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {communityOpen ? (
              <div
                id="capsule-community-menu"
                className="capsule-menu capsule-menu--community"
                role="menu"
                aria-label="Community links"
              >
                {communityLinks.map((link) => (
                  <a
                    key={link.icon}
                    className="community-link"
                    href={link.href}
                    role="menuitem"
                    aria-label={`${link.label}: ${link.description}`}
                    target={link.stub ? undefined : '_blank'}
                    rel={link.stub ? undefined : 'noopener noreferrer'}
                    onClick={(event) => {
                      if (link.stub) event.preventDefault();
                      setCommunityOpen(false);
                    }}
                  >
                    <span
                      className="community-mark"
                      style={{ color: link.color, backgroundColor: link.background }}
                      aria-hidden="true"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" role="presentation">
                        <path d={link.path} />
                      </svg>
                    </span>
                    <span className="community-copy">
                      <strong>{link.label}</strong>
                      <small>{link.description}</small>
                    </span>
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
            target="_blank"
            rel="noreferrer noopener"
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
          <Link to="/" onClick={goHome}>
            Home
          </Link>
          <Link
            to="/companies"
            className="capsule-drawer__hiring"
            onClick={() => setMenuOpen(false)}
            aria-label="Companies, Hiring"
          >
            <span>Companies</span>
            <span className="capsule-hiring-badge">Hiring</span>
          </Link>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>
            Pricing
          </a>
          <p className="capsule-drawer__label">Community</p>
          {communityLinks.map((link) => (
            <a
              key={link.icon}
              href={link.href}
              target={link.stub ? undefined : '_blank'}
              rel={link.stub ? undefined : 'noopener noreferrer'}
              onClick={(event) => {
                if (link.stub) event.preventDefault();
                setMenuOpen(false);
              }}
            >
              {link.label}
            </a>
          ))}
          <a
            href={extensionHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setMenuOpen(false)}
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
