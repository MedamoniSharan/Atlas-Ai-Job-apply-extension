import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminPayments, reconcileAdminPayment } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader } from '../components/CosmosLogo';

const API_BASE =
  import.meta.env.VITE_API_BASE?.trim() ||
  'https://atlas-ai-job-apply-extension-1.onrender.com';

export function AdminPaymentsPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payments', status, page],
    queryFn: async () => {
      const res = await fetchAdminPayments({
        status: (status as 'created' | 'paid' | 'failed') || undefined,
        page,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const reconcile = useMutation({
    mutationFn: async (id: string) => {
      const res = await reconcileAdminPayment(id);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] }),
  });

  async function openInvoice(id: string) {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_BASE}/api/v1/admin/payments/${id}/invoice`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not open invoice');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="admin-page">
      <div className="admin-filters">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="created">created</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
        </select>
      </div>

      <div className="admin-panel">
        {isLoading ? (
          <CosmosLoader label="Loading…" className="cosmos-loader--inline" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.userName || '—'}</strong>
                      <div className="muted">{p.userEmail}</div>
                    </td>
                    <td>{p.plan}</td>
                    <td>₹{(p.amountPaise / 100).toFixed(0)}</td>
                    <td>{p.status}</td>
                    <td>{p.type}</td>
                    <td>
                      {p.createdAt
                        ? new Date(p.createdAt).toLocaleString('en-IN')
                        : '—'}
                    </td>
                    <td>
                      {p.status !== 'paid' ? (
                        <button
                          type="button"
                          className="dash-btn dash-btn--ghost"
                          disabled={reconcile.isPending}
                          onClick={() => reconcile.mutate(p.id)}
                        >
                          Reconcile
                        </button>
                      ) : p.invoiceNumber ? (
                        <button
                          type="button"
                          className="dash-btn dash-btn--ghost"
                          onClick={() => void openInvoice(p.id)}
                        >
                          Invoice
                        </button>
                      ) : null}
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
