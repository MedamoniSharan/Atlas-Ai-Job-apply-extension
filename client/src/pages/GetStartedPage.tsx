import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Puzzle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { BrowserStoreButtons } from '../components/BrowserStoreButtons';
import { CosmosLoader } from '../components/CosmosLogo';
import { ShimmerButton } from '../components/ui/ShimmerButton';
import { ONBOARDING_QUERY_KEY } from '../lib/onboarding';

const CHROME_STEPS = [
  {
    title: 'Add Cosmo to Chrome',
    body: 'Click Add to Chrome on the Chrome Web Store card below. Confirm Add extension in the popup.',
  },
  {
    title: 'Pin the extension',
    body: 'Click the puzzle piece in Chrome’s toolbar, find Cosmo, and pin it so it’s always one click away.',
  },
  {
    title: 'Stay signed in here',
    body: 'Keep this Cosmo tab open after install — your account syncs to the extension automatically.',
  },
  {
    title: 'Open Naukri and start',
    body: 'Go to Naukri while logged in. The Cosmo co-pilot appears on the page — press Start to scan and apply.',
  },
] as const;

export function GetStartedPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data, isLoading } = useOnboardingStatus();

  const extensionDone =
    Boolean(data?.extensionConnected) || Boolean(data?.hasApplications);
  const prefsDone = Boolean(data?.preferencesCompleted);
  const chromeUrl = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '';

  async function refreshConnection() {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    await queryClient.refetchQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

  if (isLoading) {
    return (
      <div className="dash">
        <CosmosLoader
          label="Loading extension setup…"
          className="cosmos-loader--inline"
        />
      </div>
    );
  }

  if (extensionDone) {
    return (
      <div className="dash">
        <div className="panel onboarding-success">
          <h2>Extension connected</h2>
          <p className="muted">
            You&apos;re all set{user?.email ? ` as ${user.email}` : ''}. Open
            Naukri and use the Cosmo co-pilot to scan and apply.
          </p>
          <div className="prefs-actions">
            <a
              className="primary-btn"
              href="https://www.naukri.com"
              target="_blank"
              rel="noreferrer"
            >
              Open Naukri
            </a>
            <Link className="secondary-btn" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="panel get-extension">
        <p className="muted">
          Hi {user?.name} — install Cosmo in your browser, then keep this tab
          open so sign-in syncs.
        </p>

        <section className="get-extension__stores" aria-labelledby="stores-heading">
          <h3 id="stores-heading">Choose your browser</h3>
          <BrowserStoreButtons featured="chrome" />
        </section>

        <section
          className="get-extension__guide"
          aria-labelledby="chrome-guide-heading"
        >
          <div className="get-extension__guide-head">
            <Puzzle size={18} strokeWidth={2} aria-hidden />
            <h3 id="chrome-guide-heading">Chrome install guide</h3>
          </div>
          <p className="muted">
            For most people on Chrome — no developer mode or load unpacked.
            Just install from the store and pin Cosmo.
          </p>

          <ol className="get-extension__steps">
            {CHROME_STEPS.map((step, index) => (
              <li key={step.title} className="get-extension__step">
                <span className="get-extension__step-num">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p className="muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="get-extension__actions">
            {chromeUrl ? (
              <ShimmerButton
                className="get-extension__chrome-cta"
                onClick={() => window.open(chromeUrl, '_blank', 'noopener,noreferrer')}
              >
                Add to Chrome
              </ShimmerButton>
            ) : (
              <ShimmerButton
                className="get-extension__chrome-cta"
                onClick={() =>
                  window.alert(
                    'Chrome Web Store link will appear here once published. Edge and Firefox cards are listed above too.'
                  )
                }
              >
                Add to Chrome
              </ShimmerButton>
            )}
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                void refreshConnection();
              }}
            >
              <RefreshCw size={16} strokeWidth={2.2} aria-hidden />
              Check connection
            </button>
          </div>
        </section>

        {!prefsDone ? (
          <p className="get-extension__prefs muted">
            <Check size={14} strokeWidth={2.4} aria-hidden />{' '}
            After installing, set job preferences in{' '}
            <Link to="/settings">Settings</Link> so Cosmo knows what to scan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
