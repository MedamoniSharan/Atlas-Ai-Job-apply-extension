import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'motion/react';
import { CosmosIconMark, CosmovaiWordmark } from './CosmosLogo';
import { Highlighter } from './ui/highlighter';

const connectLinks = ['Instagram', 'TikTok', 'X', 'Substack'];
const moreLinks = ['Careers', 'Terms', 'Privacy'];

function PoweredByCodex() {
  return (
    <p className="footer-powered">
      <span className="footer-powered__prefix">powered by</span>{' '}
      <a
        className="footer-powered__link"
        href="https://codexcareer.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Highlighter
          action="highlight"
          color="#FFB347"
          strokeWidth={1.8}
          animationDuration={700}
          iterations={2}
          padding={3}
          isView
        >
          <span className="footer-powered__brand">codexcareer</span>
        </Highlighter>
      </a>
    </p>
  );
}

function FooterLogo({ size }: { size: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [spinKey, setSpinKey] = useState(0);
  const isInView = useInView(ref, {
    once: false,
    amount: 0.7,
    margin: '0px 0px -10% 0px',
  });

  useEffect(() => {
    if (!isInView) return;
    setSpinKey((key) => key + 1);
  }, [isInView]);

  return (
    <Link
      ref={ref}
      className="footer-mark"
      to="/"
      aria-label="Cosmo home"
    >
      <CosmosIconMark
        key={spinKey}
        size={size}
        className={`cosmos-mark__logo${isInView ? ' cosmos-mark__logo--spin' : ''}`}
      />
    </Link>
  );
}

export function CosmosDreamFooter() {
  return (
    <div className="cosmos-page">
      <footer className="site-footer">
        <div className="desktop-footer">
          <nav aria-label="Connect" className="footer-links">
            {connectLinks.map((link) => (
              <a key={link} href="#" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </nav>
          <div className="footer-center">
            <FooterLogo size={48} />
            <PoweredByCodex />
          </div>
          <nav aria-label="More" className="footer-links">
            {moreLinks.map((link) => (
              <a key={link} href="#" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </nav>
        </div>

        <div className="mobile-footer">
          <div className="footer-center footer-center--mobile">
            <FooterLogo size={32} />
            <PoweredByCodex />
          </div>
          <div className="mobile-nav-group">
            <h3>Connect</h3>
            {connectLinks.map((link) => (
              <a key={link} href="#" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </div>
          <div className="mobile-nav-group">
            <h3>More</h3>
            {moreLinks.map((link) => (
              <a key={link} href="#" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </div>
        </div>

        <Link className="wordmark-link" to="/" aria-label="cosmovai home">
          <CosmovaiWordmark />
        </Link>
      </footer>
    </div>
  );
}
