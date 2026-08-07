import { Link } from 'react-router-dom';
import { CosmosDreamFooter } from '../components/CosmosDreamFooter';
import { LandingNavbar } from '../components/LandingNavbar';
import { SeoHead } from '../components/SeoHead';
import { CHROME_EXTENSION_URL } from '../lib/chromeExtension';
import { breadcrumbJsonLd, webPageJsonLd } from '../lib/jsonLd';
import { SUPPORT_EMAIL } from '../lib/seo';
import '../styles/landing-fonts.css';

const DESCRIPTION =
  'Get help with Cosmo Job Assistant: install the Chrome extension, Google sign-in, Naukri co-pilot, billing, and security reports.';

export function SupportPage() {
  return (
    <div className="landing legal-page">
      <SeoHead
        title="Support"
        description={DESCRIPTION}
        path="/support"
        jsonLd={[
          webPageJsonLd({
            name: 'Support — Cosmo Job Assistant',
            description: DESCRIPTION,
            path: '/support',
          }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Support', path: '/support' },
          ]),
        ]}
      />
      <LandingNavbar />
      <main className="legal-main">
        <div className="legal-card">
          <p className="legal-eyebrow">
            <Link to="/">Cosmo</Link>
            <span aria-hidden> / </span>
            Support
          </p>
          <h1 className="legal-title">Support</h1>
          <p className="legal-updated">
            Cosmo Job Assistant · Cosmovai
          </p>
          <div className="legal-body">
            <h2>Contact</h2>
            <p>
              Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for
              product help, billing, or account questions.
            </p>
            <p>When emailing, include:</p>
            <ul>
              <li>Cosmo account email</li>
              <li>Browser and version (Chrome / Edge / Firefox)</li>
              <li>Extension version (from chrome://extensions or equivalent)</li>
              <li>Steps to reproduce and screenshots if possible</li>
            </ul>

            <h2>Installing the extension</h2>
            <ol>
              <li>
                Open the{' '}
                <a
                  href={CHROME_EXTENSION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cosmo Job Assistant Chrome Web Store listing
                </a>{' '}
                (or use Add to Chrome on{' '}
                <Link to="/">cosmovai.in</Link>).
              </li>
              <li>Install the extension and pin it for easy access.</li>
              <li>
                Sign in to the Cosmo dashboard with Google so the extension can
                sync your session.
              </li>
            </ol>

            <h2>Signing in</h2>
            <ul>
              <li>Dashboard users sign in with Google.</li>
              <li>
                The extension receives session tokens from the dashboard when
                you are signed in on the Cosmo site.
              </li>
              <li>
                Use the production HTTPS site (www.cosmovai.in) with store builds
                of the extension.
              </li>
            </ul>

            <h2>Naukri co-pilot</h2>
            <ul>
              <li>
                You must be logged into Naukri in the same browser profile.
              </li>
              <li>
                Co-pilot requires explicit consent in the panel before assisted
                scanning or Easy Apply.
              </li>
              <li>
                Captchas, company-site redirects, and screening questions may
                block Easy Apply automation.
              </li>
            </ul>
            <p>
              See the <Link to="/faq">FAQ</Link> for more on human-paced assists
              versus bulk bots, and{' '}
              <Link to="/blog/naukri-easy-apply-copilot-guide">
                the step-by-step co-pilot guide
              </Link>
              .
            </p>

            <h2>Billing</h2>
            <p>
              Paid plans are managed on the Cosmo website via Razorpay
              Subscriptions. For failed charges or cancellation questions, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your
              account email. Compare plans on{' '}
              <Link to="/#pricing">pricing</Link>.
            </p>

            <h2>Privacy &amp; terms</h2>
            <ul>
              <li>
                <Link to="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/terms">Terms of Service</Link>
              </li>
            </ul>

            <h2>Status / outages</h2>
            <p>
              If the API is unreachable, the extension queues events locally and
              retries when connectivity returns. Check Cosmovai status
              communications for planned maintenance.
            </p>

            <h2>Security reports</h2>
            <p>
              Report suspected vulnerabilities to{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with
              subject <code>Security report</code>. Do not include real user
              credentials in the report.
            </p>
          </div>
        </div>
      </main>
      <CosmosDreamFooter />
    </div>
  );
}
