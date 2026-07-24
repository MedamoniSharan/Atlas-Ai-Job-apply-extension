import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, Sparkle, X } from 'lucide-react';
import { CosmosMark } from '../components/CosmosLogo';
import './NotFoundPage.css';

const NAV_LINKS = [
  { label: 'Pricing', to: '/#pricing' },
  { label: 'Get Extension', to: '/get-extension' },
  { label: 'Sign in', to: '/login' },
  { label: 'Sign up', to: '/register' },
  { label: 'Privacy', to: '/privacy' },
] as const;

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260713_234424_b1332b69-2e69-4302-8dbc-40f86846afbd.mp4';

const SPARKLES = [
  { top: '18%', left: '22%', size: 18, delay: '0s' },
  { top: '28%', left: '72%', size: 14, delay: '0.4s' },
  { top: '42%', left: '16%', size: 12, delay: '0.8s' },
  { top: '48%', left: '78%', size: 16, delay: '0.2s' },
  { top: '58%', left: '68%', size: 11, delay: '1s' },
  { top: '22%', left: '58%', size: 10, delay: '0.6s' },
] as const;

export function NotFoundPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scaleY, setScaleY] = useState(1);
  const text404Ref = useRef<HTMLDivElement>(null);

  const updateScale = useCallback(() => {
    const el = text404Ref.current;
    if (!el) return;
    const height = el.offsetHeight;
    if (height <= 0) return;
    setScaleY(window.innerHeight / height);
  }, []);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = '404 - Page Not Found';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = menuOpen ? 'hidden' : prev || '';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="tt-404">
      {/* Soft 404 + vertical spotlight (matches reference glow) */}
      <div
        className="tt-404__bg"
        aria-hidden="true"
        style={{
          WebkitMaskImage:
            'linear-gradient(to bottom, black 40%, transparent 95%)',
          maskImage: 'linear-gradient(to bottom, black 40%, transparent 95%)',
        }}
      >
        <div className="tt-404__bg-inner">
          <div
            ref={text404Ref}
            className="tt-404__giant"
            style={{ transform: `scale(1.15, ${scaleY * 1.4})` }}
          >
            404
          </div>
          <div
            className="tt-404__oval"
            style={{
              transform: `scaleY(${scaleY})`,
              transformOrigin: 'center',
            }}
          />
        </div>
      </div>

      <header className="tt-404__nav">
        <Link to="/" className="tt-404__brand" aria-label="Cosmo home">
          <CosmosMark logoSize={28} />
        </Link>

        <nav className="tt-404__nav-links" aria-label="Primary">
          {NAV_LINKS.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className="tt-404__menu-btn"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="tt-404__icon-sm" aria-hidden="true" />
          <span className="tt-404__menu-label">Menu</span>
        </button>
      </header>

      <div
        className={`tt-404__overlay ${menuOpen ? 'is-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <button
          type="button"
          className="tt-404__backdrop"
          aria-label="Close menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
        />
        <aside className="tt-404__panel" role="dialog" aria-modal="true">
          <div className="tt-404__panel-header">
            <Link
              to="/"
              className="tt-404__brand"
              aria-label="Cosmo home"
              onClick={() => setMenuOpen(false)}
            >
              <CosmosMark logoSize={28} />
            </Link>
            <button
              type="button"
              className="tt-404__close"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <X className="tt-404__icon-md" aria-hidden="true" />
            </button>
          </div>

          <nav className="tt-404__panel-nav" aria-label="Mobile">
            {NAV_LINKS.map((item, i) => (
              <Link
                key={item.to}
                to={item.to}
                className="tt-404__panel-item"
                style={{
                  transitionDelay: menuOpen ? `${150 + i * 60}ms` : '0ms',
                }}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div
            className="tt-404__panel-cta"
            style={{ transitionDelay: menuOpen ? '450ms' : '0ms' }}
          >
            <Link
              to="/"
              className="tt-404__panel-home"
              onClick={() => setMenuOpen(false)}
            >
              <ArrowLeft className="tt-404__icon-md" aria-hidden="true" />
              Go back home
            </Link>
          </div>
        </aside>
      </div>

      <div className="tt-404__stage">
        <div className="tt-404__video-blend">
          <div className="tt-404__video-box">
            <video
              className="tt-404__video"
              src={VIDEO_SRC}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
        </div>

        <div className="tt-404__sparkles" aria-hidden="true">
          {SPARKLES.map((s, i) => (
            <Sparkle
              key={i}
              className="tt-404__sparkle"
              style={{
                top: s.top,
                left: s.left,
                width: s.size,
                height: s.size,
                animationDelay: s.delay,
              }}
              fill="currentColor"
              strokeWidth={1.5}
            />
          ))}
        </div>
      </div>

      <div className="tt-404__bottom">
        <h1 className="tt-404__heading">Oops, something went wrong!</h1>
        <p className="tt-404__sub">This page does not exist.</p>
        <Link to="/" className="tt-404__home-btn">
          <ArrowLeft className="tt-404__icon-responsive" aria-hidden="true" />
          Go back home
        </Link>
      </div>
    </div>
  );
}
