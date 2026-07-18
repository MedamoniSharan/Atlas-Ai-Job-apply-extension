import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@atlas/shared';
import { fetchApplications } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { ExtensionOnboarding } from '../components/ExtensionOnboarding';
import { useAuthStore } from '../store/authStore';

function sourceLabel(app: Application): string {
  if (app.metadata?.skipped) return 'Skipped';
  if (app.status === 'applied') return 'Applied';
  if (app.metadata?.source === 'auto_scan') return 'Matched';
  if (app.metadata?.source === 'auto_apply') return 'Applied';
  return app.status;
}

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [liveHint, setLiveHint] = useState('');
  const { data: onboarding } = useOnboardingStatus();

  const { data, isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const res = await fetchApplications();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const onUpdate = useCallback(
    (app: Application) => {
      setLiveHint(`Updated: ${app.title} @ ${app.company}`);
      queryClient.setQueryData(
        ['applications'],
        (old: typeof data | undefined) => {
          if (!old) return old;
          const exists = old.items.some((i) => i.id === app.id);
          const items = exists
            ? old.items.map((i) => (i.id === app.id ? app : i))
            : [app, ...old.items];
          return {
            ...old,
            items,
            total: exists ? old.total : old.total + 1,
          };
        }
      );
    },
    [queryClient]
  );

  useApplicationSocket(onUpdate);

  const needsPrefs = onboarding && !onboarding.preferencesCompleted;
  const showOnboarding =
    onboarding &&
    !onboarding.extensionConnected &&
    !onboarding.hasApplications;

  return (
    <div className="page">
      {needsPrefs && (
        <div className="panel onboarding-panel">
          <h3>Set job preferences</h3>
          <p className="muted">
            Add titles or keywords so Atlas can scan and apply on Naukri.
          </p>
          <Link className="primary-btn" to="/get-started">
            Complete preferences
          </Link>
        </div>
      )}

      {showOnboarding && !needsPrefs && (
        <div className="panel onboarding-panel">
          <ExtensionOnboarding compact userEmail={user?.email} />
          <Link className="onboarding__link" to="/get-started">
            View full setup guide →
          </Link>
        </div>
      )}

      <div className="panel">
        <h2>Applications</h2>
        <p className="muted">
          Matched from scan and applied via the extension in near real time.
          {liveHint ? ` · ${liveHint}` : ''}
        </p>

        {isLoading && <p className="empty">Loading applications…</p>}
        {error && (
          <p className="error">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {data && data.items.length === 0 && !showOnboarding && !needsPrefs && (
          <p className="empty">
            No matches yet. Open Naukri while logged in, or use Scan now in the
            extension.
          </p>
        )}

        {data && data.items.length > 0 && (
          <table className="apps-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Platform</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((app) => (
                <tr key={app.id}>
                  <td>
                    {app.url ? (
                      <a href={app.url} target="_blank" rel="noreferrer">
                        {app.title}
                      </a>
                    ) : (
                      app.title
                    )}
                    {app.metadata?.skipReason ? (
                      <div className="muted tiny">{app.metadata.skipReason}</div>
                    ) : null}
                  </td>
                  <td>{app.company}</td>
                  <td>{app.platform}</td>
                  <td>
                    <span className="badge">{sourceLabel(app)}</span>
                  </td>
                  <td>
                    {new Date(app.appliedAt ?? app.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
