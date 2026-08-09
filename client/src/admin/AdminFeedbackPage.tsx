import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UNINSTALL_REASON_LABELS, type UninstallReason } from '@cosmo/shared';
import { fetchAdminUninstallFeedback } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

function reasonLabel(reason?: string) {
  if (!reason) return '—';
  return (
    UNINSTALL_REASON_LABELS[reason as UninstallReason] || reason
  );
}

export function AdminFeedbackPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'uninstall-feedback', page],
    queryFn: async () => {
      const res = await fetchAdminUninstallFeedback(page);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  return (
    <div className="admin-page">
      <div className="admin-panel">
        <p className="admin-panel__hint muted">
          Reasons submitted when users uninstall the Cosmo Chrome extension.
        </p>
        {isLoading ? (
          <CosmosLoader label="Loading feedback…" className="cosmos-loader--inline" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Reason</th>
                  <th>Comment</th>
                  <th>Contact</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No uninstall feedback yet.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString('en-IN')
                          : '—'}
                      </td>
                      <td>
                        <strong>{reasonLabel(item.reason)}</strong>
                      </td>
                      <td>
                        <span className="admin-feedback-comment">
                          {item.comment?.trim() || '—'}
                        </span>
                      </td>
                      <td>{item.email?.trim() || '—'}</td>
                      <td>
                        <div className="muted">
                          {[item.source, item.browser, item.extensionVersion]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
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
