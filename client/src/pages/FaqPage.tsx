import { Link } from 'react-router-dom';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { FAQ_ITEMS, FAQ_PAGE_DESCRIPTION } from '../content/faq';
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  webPageJsonLd,
} from '../lib/jsonLd';
import '../styles/landing-fonts.css';

export function FaqPage() {
  return (
    <div className="landing legal-page">
      <SeoHead
        title="FAQ"
        description={FAQ_PAGE_DESCRIPTION}
        path="/faq"
        jsonLd={[
          webPageJsonLd({
            name: 'FAQ — Cosmo Job Assistant',
            description: FAQ_PAGE_DESCRIPTION,
            path: '/faq',
          }),
          faqPageJsonLd(FAQ_ITEMS),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'FAQ', path: '/faq' },
          ]),
        ]}
      />
      <LandingNavbar />
      <main className="legal-main">
        <div className="legal-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            FAQ
          </p>
          <h1 className="legal-title">Frequently asked questions</h1>
          <p className="legal-updated">
            Cosmo Job Assistant — Naukri co-pilot &amp; application tracker
          </p>
          <div className="legal-body">
            <p>
              Clear facts about what Cosmo is and is not. For install and billing
              help, see <Link to="/support">Support</Link>. To get started,{' '}
              <Link to="/#get-extension">add the Chrome extension</Link> or
              review <Link to="/#pricing">pricing</Link>.
            </p>

            <h2>What Cosmo is</h2>
            <ul>
              <li>
                A Naukri Easy Apply co-pilot and job application sync dashboard
                by Cosmovai
              </li>
              <li>
                Human-paced assisted applies with preference-based scanning
              </li>
              <li>Google sign-in for the dashboard and extension bridge</li>
            </ul>

            <h2>What Cosmo is not</h2>
            <ul>
              <li>Unattended bulk-apply malware or silent mass apply</li>
              <li>
                A multi-board Greenhouse / Workday / Ashby co-pilot today (Naukri
                is the current focus)
              </li>
              <li>
                A guarantee of interviews or offers—employers control outcomes
              </li>
            </ul>

            {FAQ_ITEMS.map((item) => (
              <section key={item.question}>
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
              </section>
            ))}

            <h2>Guides</h2>
            <ul>
              <li>
                <Link to="/blog/naukri-easy-apply-copilot-guide">
                  Naukri Easy Apply co-pilot walkthrough
                </Link>
              </li>
              <li>
                <Link to="/blog/naukri-auto-apply-safely">
                  Human-paced auto apply vs bulk bots
                </Link>
              </li>
              <li>
                <Link to="/blog">All guides</Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
