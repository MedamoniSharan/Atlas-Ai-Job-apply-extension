import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { PreferencesForm } from '../components/PreferencesForm';
import { ONBOARDING_QUERY_KEY } from '../lib/onboarding';

export function SettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return (
    <div className="page">
      <div className="panel settings-grid">
        <div>
          <h2>Settings</h2>
          <p className="muted">
            Manage account details and job-search preferences used by the
            extension for scan and Easy Apply.
          </p>
        </div>

        <div>
          <strong>Signed in as</strong>
          <p className="muted">
            {user?.name} · {user?.email}
          </p>
        </div>

        <div>
          <strong>Access token</strong>
          <p className="muted">
            Prefer signing in from the extension popup. Tokens expire.
          </p>
          <code>{accessToken ?? '—'}</code>
        </div>

        <div>
          <strong>API base URL</strong>
          <p className="muted">Default for local development</p>
          <code>http://localhost:4000</code>
        </div>
      </div>

      <div className="panel">
        <h2>Job preferences</h2>
        <p className="muted">
          Titles, keywords, and filters drive auto-scan and auto-apply on
          Naukri.
        </p>
        <PreferencesForm
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: ONBOARDING_QUERY_KEY,
            });
          }}
        />
      </div>
    </div>
  );
}
