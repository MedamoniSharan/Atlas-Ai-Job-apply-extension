import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Application } from '@codexcareer/shared';
import { fetchApplications } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [liveHint, setLiveHint] = useState('');

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

  return (
    <div className="page">
      <div className="panel">
        <h2>Applications</h2>
        <p className="muted">
          Synced from your extension in near real time.
          {liveHint ? ` · ${liveHint}` : ''}
        </p>

        {isLoading && <p className="empty">Loading applications…</p>}
        {error && (
          <p className="error">
            {error instanceof Error ? error.message : 'Failed to load'}
          </p>
        )}

        {data && data.items.length === 0 && (
          <p className="empty">
            No applications yet. Install the extension and browse Naukri while
            signed in.
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
                  </td>
                  <td>{app.company}</td>
                  <td>{app.platform}</td>
                  <td>
                    <span className="badge">{app.status}</span>
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
