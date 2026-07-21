import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { ExtensionOnboarding } from '../components/ExtensionOnboarding';
import { PreferencesForm } from '../components/PreferencesForm';
import { CosmosLoader } from '../components/CosmosLogo';
import { ONBOARDING_QUERY_KEY } from '../lib/onboarding';

export function GetStartedPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { data, isLoading } = useOnboardingStatus();
  const [prefsSavedLocally, setPrefsSavedLocally] = useState(false);

  if (isLoading) {
    return (
      <div className="dash">
        <CosmosLoader
          label="Loading setup…"
          className="cosmos-loader--inline"
        />
      </div>
    );
  }

  const prefsDone =
    Boolean(data?.preferencesCompleted) || prefsSavedLocally;
  const extensionDone =
    Boolean(data?.extensionConnected) || Boolean(data?.hasApplications);

  if (prefsDone && extensionDone) {
    return (
      <div className="dash">
        <div className="panel onboarding-success">
          <h2>You&apos;re set up</h2>
          <p className="muted">
            Preferences saved and extension connected. Open Naukri — the
            Co-Pilot panel appears at the bottom left. Press Start to scan and
            apply.
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
              View dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="panel">
        <h2>Get started</h2>
        <p className="muted">Hi {user?.name} — finish these two steps.</p>

        <ol className="setup-steps">
          <li className={prefsDone ? 'done' : 'active'}>
            Job preferences {prefsDone ? '✓' : ''}
          </li>
          <li className={!prefsDone ? '' : extensionDone ? 'done' : 'active'}>
            Install extension {extensionDone ? '✓' : ''}
          </li>
        </ol>

        {!prefsDone ? (
          <>
            <h3>1. Tell us what to look for</h3>
            <p className="muted">
              Atlas will scan Naukri using these preferences and can auto-apply
              Easy Apply jobs when enabled.
            </p>
            <PreferencesForm
              submitLabel="Save and continue"
              onSaved={async () => {
                setPrefsSavedLocally(true);
                await queryClient.invalidateQueries({
                  queryKey: ONBOARDING_QUERY_KEY,
                });
                await queryClient.refetchQueries({
                  queryKey: ONBOARDING_QUERY_KEY,
                });
              }}
            />
          </>
        ) : (
          <>
            <h3>2. Connect the Chrome extension</h3>
            <p className="muted">
              After the extension is signed in, open Naukri — Atlas Co-Pilot
              appears on the page so you can Start scanning.
            </p>
            <ExtensionOnboarding userEmail={user?.email} />
            <a
              className="primary-btn"
              href="https://www.naukri.com"
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: '1rem', display: 'inline-flex' }}
            >
              Open Naukri with Co-Pilot
            </a>
          </>
        )}
      </div>
    </div>
  );
}
