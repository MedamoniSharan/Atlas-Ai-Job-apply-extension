import * as React from 'react';

type Company = {
  name: string;
  image: string;
};

type MarqueeColumn = {
  id: string;
  companies: Company[];
  height: 'short' | 'medium' | 'tall';
  direction: 'up' | 'down';
  delay: string;
};

const companyImages: Record<string, string> = {
  Deloitte:
    'https://framerusercontent.com/images/wnpJwMToCmeJyhWFP1MDD1Und94.png?width=256&height=256',
  Meta: 'https://framerusercontent.com/images/SskZ0HGS5mrS9bZX6Qs5MVyJWE.png?width=256&height=256',
  Salesforce:
    'https://framerusercontent.com/images/KwW8bLrOqlzUx21QzxPWkEsxjHw.png?width=256&height=256',
  Netflix:
    'https://framerusercontent.com/images/lJTCFIBazjXoNxFCBW081kwaYw.png?width=256&height=256',
  'Y Combinator':
    'https://framerusercontent.com/images/VApCQE98UZYFDtTeWcbRAahIGM.png?width=256&height=256',
  Spotify:
    'https://framerusercontent.com/images/ASpEhrDUYqtUW5NX8Z9odk3UG14.png?width=256&height=256',
  Stripe:
    'https://framerusercontent.com/images/v7x05ge1T6NDPpgUzGKTYhXCt4s.png?width=256&height=256',
  Nike: 'https://framerusercontent.com/images/Bg8BXtB6XSZRU3SnkUTAYR6FdVw.png?width=256&height=256',
  Notion:
    'https://framerusercontent.com/images/GNLPxUf6XqBc2lyXsz1pRw45Yo.png?width=256&height=256',
  Shopify:
    'https://framerusercontent.com/images/MCeuPmi0zASPc1lZp0SNDbuWfK0.png?width=256&height=256',
  Amazon:
    'https://framerusercontent.com/images/fM0YrFKe43XMX8G6LOJbNhdLy9k.png?width=256&height=256',
  Microsoft:
    'https://framerusercontent.com/images/DwxWArvKBq7fTlng6eumHhip6Y4.png?width=256&height=256',
  Airbnb:
    'https://framerusercontent.com/images/JPlCOisBa46PDIa7CGPMLzfzmeg.png?width=256&height=256',
  Google:
    'https://framerusercontent.com/images/78kx1iUwpJH8aVmtrMtLnqgD8.png?width=256&height=256',
  'Goldman Sachs':
    'https://framerusercontent.com/images/XqvvyDxmTnbVwceBIL4zVPtMJO8.png?width=256&height=256',
  BCG: 'https://framerusercontent.com/images/5UFnB4wbUk5IMeGTsDxfOGsn9K8.png?width=256&height=256',
  McKinsey:
    'https://framerusercontent.com/images/7tn334dWiklYA8rleGoXnzjRn0.png?width=256&height=256',
};

const makeCompanies = (names: string[]): Company[] =>
  names.map((name) => ({
    name,
    image: companyImages[name],
  }));

const columnData: MarqueeColumn[] = [
  {
    id: 'first',
    companies: makeCompanies([
      'Deloitte',
      'Meta',
      'Salesforce',
      'Netflix',
      'Y Combinator',
      'Spotify',
    ]),
    height: 'short',
    direction: 'up',
    delay: '-3s',
  },
  {
    id: 'second',
    companies: makeCompanies(['Stripe', 'Nike', 'Notion', 'Shopify', 'Amazon']),
    height: 'medium',
    direction: 'down',
    delay: '-10s',
  },
  {
    id: 'third',
    companies: makeCompanies([
      'Microsoft',
      'Airbnb',
      'Google',
      'Goldman Sachs',
      'BCG',
      'McKinsey',
    ]),
    height: 'tall',
    direction: 'up',
    delay: '-16s',
  },
  {
    id: 'fourth',
    companies: makeCompanies([
      'Deloitte',
      'Meta',
      'Salesforce',
      'Netflix',
      'Y Combinator',
      'Spotify',
    ]),
    height: 'medium',
    direction: 'down',
    delay: '-7s',
  },
  {
    id: 'fifth',
    companies: makeCompanies(['Stripe', 'Nike', 'Notion', 'Shopify', 'Amazon']),
    height: 'tall',
    direction: 'up',
    delay: '-14s',
  },
  {
    id: 'sixth',
    companies: makeCompanies([
      'Microsoft',
      'Airbnb',
      'Google',
      'Goldman Sachs',
      'BCG',
      'McKinsey',
    ]),
    height: 'medium',
    direction: 'down',
    delay: '-19s',
  },
  {
    id: 'seventh',
    companies: makeCompanies([
      'Deloitte',
      'Meta',
      'Salesforce',
      'Netflix',
      'Y Combinator',
      'Spotify',
    ]),
    height: 'short',
    direction: 'up',
    delay: '-5s',
  },
];

const getHeightClass = (height: MarqueeColumn['height']) => {
  if (height === 'short') return 'sprout-column--short';
  if (height === 'tall') return 'sprout-column--tall';
  return 'sprout-column--medium';
};

export function SproutJobsMarquee() {
  const [isPaused, setIsPaused] = React.useState(false);

  return (
    <section className="sprout-page" aria-labelledby="sprout-title">
      <div className="sprout-content">
        <header className="sprout-intro">
          <div className="sprout-badge" aria-label="Tsenta platform promise">
            <span className="sprout-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 20V10M12 14c-2.8-3.1-6.1-3.1-8-3 0 4.6 2.7 7 8 7M12 12c2.1-3.8 5-5.2 8-5 0 4.7-2.7 7-8 7"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>Millions of Jobs, One Platform</span>
          </div>
          <h2 id="sprout-title" className="sprout-heading">
            <span>10+ million jobs worldwide, </span>
            <span className="sprout-heading-muted">all in one place.</span>
          </h2>
          <p className="sprout-description">
            Discover opportunities from top companies across every industry —
            updated daily on Tsenta.
          </p>
        </header>

        <div
          className="sprout-marquee"
          aria-label="Companies hiring on Tsenta"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {columnData.map((column) => (
            <div
              className={`sprout-column ${getHeightClass(column.height)}`}
              key={column.id}
            >
              <div
                className={`sprout-track sprout-track--${column.direction}`}
                style={
                  {
                    '--sprout-delay': column.delay,
                    animationPlayState: isPaused ? 'paused' : 'running',
                  } as React.CSSProperties
                }
              >
                {[...column.companies, ...column.companies].map(
                  (company, companyIndex) => (
                    <div
                      className="sprout-card"
                      key={`${column.id}-${company.name}-${companyIndex}`}
                      title={company.name}
                    >
                      <img
                        src={company.image}
                        alt={`${company.name} logo`}
                        loading="lazy"
                      />
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
