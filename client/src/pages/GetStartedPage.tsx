import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { BrowserStoreButtons } from '../components/BrowserStoreButtons';
import { CosmosLoader } from '../components/CosmosLogo';
import { ONBOARDING_QUERY_KEY } from '../lib/onboarding';

export function GetStartedPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data, isLoading } = useOnboardingStatus();

  const extensionDone =
    Boolean(data?.extensionConnected) || Boolean(data?.hasApplications);
  const prefsDone = Boolean(data?.preferencesCompleted);

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

  return (
    <div className="dash">
      <div className="panel get-extension">
        {extensionDone ? (
          <div className="get-extension__status">
            <h2>Extension connected</h2>
            <p className="muted">
              You&apos;re all set{user?.email ? ` as ${user.email}` : ''}. Open
              Naukri and use the Cosmo co-pilot to scan and apply — or grab Cosmo
              for another browser below.
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
        ) : (
          <p className="muted">
            Hi {user?.name} — install Cosmo in your browser, then keep this tab
            open so sign-in syncs.
          </p>
        )}

        <section className="get-extension__stores" aria-labelledby="stores-heading">
          <h3 id="stores-heading">Choose your browser</h3>
          <BrowserStoreButtons featured="chrome" />
        </section>

        {!extensionDone ? (
          <div className="get-extension__actions">
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
        ) : null}

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
