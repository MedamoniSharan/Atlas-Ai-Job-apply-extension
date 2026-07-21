import { Link } from 'react-router-dom';
import { CosmosIconMark, TsentaWordmark } from './CosmosLogo';

const connectLinks = ['Instagram', 'TikTok', 'X', 'Substack'];
const moreLinks = ['Careers', 'Terms', 'Privacy'];

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
          <Link className="footer-mark" to="/" aria-label="Tsenta home">
            <CosmosIconMark size={48} />
          </Link>
          <nav aria-label="More" className="footer-links">
            {moreLinks.map((link) => (
              <a key={link} href="#" onClick={(e) => e.preventDefault()}>
                {link}
              </a>
            ))}
          </nav>
        </div>

        <div className="mobile-footer">
          <Link className="mobile-mark" to="/" aria-label="Tsenta home">
            <CosmosIconMark size={32} />
          </Link>
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

        <Link className="wordmark-link" to="/" aria-label="Tsenta home">
          <TsentaWordmark />
        </Link>
      </footer>
    </div>
  );
}
