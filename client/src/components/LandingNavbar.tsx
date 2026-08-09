import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { CosmosMark } from './CosmosLogo';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';

type CommunityIcon = 'instagram' | 'twitter' | 'linkedin' | 'threads';

type CommunityLink = {
  icon: CommunityIcon;
  label: string;
  description: string;
  color: string;
  background: string;
  href: string;
  path: string;
  stub?: boolean;
};

const communityLinks: CommunityLink[] = [
  {
    icon: 'instagram',
    label: 'Instagram',
    description: 'Join the Instagram channel',
    color: '#E1306C',
    background: 'rgba(225, 48, 108, 0.12)',
    href: 'https://www.instagram.com/codex.career/',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
  },
  {
    icon: 'twitter',
    label: 'Twitter',
    description: 'Follow Cosmo on X',
    color: '#111827',
    background: 'rgba(17, 24, 39, 0.08)',
    href: 'https://x.com/codexcareer',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    icon: 'linkedin',
    label: 'LinkedIn',
    description: 'Connect with Cosmo on LinkedIn',
    color: '#0A66C2',
    background: 'rgba(10, 102, 194, 0.12)',
    href: 'https://www.linkedin.com/in/codexcareer/',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24.001.774 23.2 0 22.222 0h.003z',
  },
  {
    icon: 'threads',
    label: 'Threads',
    description: 'Follow Cosmo on Threads',
    color: '#111827',
    background: 'rgba(17, 24, 39, 0.08)',
    href: 'https://www.threads.com/@codex.career',
    path: 'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z',
  },
];

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
  const extensionHref = CHROME_EXTENSION_URL;

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
          <a className="capsule-link" href="#top">
            Home
          </a>
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
          <a href="#top" onClick={() => setMenuOpen(false)}>
            Home
          </a>
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
