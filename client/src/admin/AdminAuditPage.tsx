import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAudit } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: async () => {
      const res = await fetchAdminAudit(page);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  return (
    <div className="admin-page">
      <div className="admin-panel">
        {isLoading ? (
          <CosmosLoader label="Loading audit…" className="cosmos-loader--inline" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleString('en-IN')
                        : '—'}
                    </td>
                    <td>
                      <strong>{a.adminName || '—'}</strong>
                      <div className="muted">{a.adminEmail}</div>
                    </td>
                    <td>{a.action}</td>
                    <td>
                      {a.targetType}
                      {a.targetId ? ` · ${a.targetId.slice(0, 8)}…` : ''}
                    </td>
                    <td>
                      <code className="admin-code">
                        {a.after ? JSON.stringify(a.after) : '—'}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data ? (
          <div className="admin-pager">
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span>
              Page {data.page} / {data.totalPages}
            </span>
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
