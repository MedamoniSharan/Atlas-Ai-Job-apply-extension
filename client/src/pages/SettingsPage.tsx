import { useAuthStore } from '../store/authStore';

export function SettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  return (
    <div className="page">
      <div className="panel settings-grid">
        <div>
          <h2>Settings</h2>
          <p className="muted">
            Paste your access token into the Chrome extension after signing in
            here, or sign in directly from the extension popup with the same
            account.
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
            Use this only for local linking. Tokens expire; prefer extension
            login.
          </p>
          <code>{accessToken ?? '—'}</code>
        </div>

        <div>
          <strong>API base URL</strong>
          <p className="muted">Default for local development</p>
          <code>http://localhost:4000</code>
        </div>
      </div>
    </div>
  );
}
