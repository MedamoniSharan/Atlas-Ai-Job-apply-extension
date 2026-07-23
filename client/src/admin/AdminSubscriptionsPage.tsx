import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelAdminSubscription,
  extendAdminSubscription,
  fetchAdminSubscriptions,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

export function AdminSubscriptionsPage() {
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'subscriptions', status, tier, page],
    queryFn: async () => {
      const res = await fetchAdminSubscriptions({
        status: status || undefined,
        tier: (tier as 'pro' | 'max') || undefined,
        page,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({
      id,
      immediate,
    }: {
      id: string;
      immediate: boolean;
    }) => {
      const res = await cancelAdminSubscription(id, immediate);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });

  const extendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await extendAdminSubscription(id, 30);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });

  return (
    <div className="admin-page">
      <div className="admin-filters">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired'].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            )
          )}
        </select>
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}>
          <option value="">All tiers</option>
          <option value="pro">pro</option>
          <option value="max">max</option>
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
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Period end</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.userName || '—'}</strong>
                      <div className="muted">{s.userEmail}</div>
                    </td>
                    <td>{s.tier}</td>
                    <td>
                      {s.status}
                      {s.cancelAtPeriodEnd ? ' · cancel@end' : ''}
                    </td>
                    <td>{s.source}</td>
                    <td>
                      {s.currentPeriodEnd
                        ? new Date(s.currentPeriodEnd).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="dash-btn dash-btn--ghost"
                        disabled={extendMutation.isPending}
                        onClick={() => extendMutation.mutate(s.id)}
                      >
                        +30d
                      </button>
                      <button
                        type="button"
                        className="dash-btn dash-btn--ghost"
                        disabled={cancelMutation.isPending}
                        onClick={() =>
                          cancelMutation.mutate({ id: s.id, immediate: false })
                        }
                      >
                        Cancel EoP
                      </button>
                      <button
                        type="button"
                        className="dash-btn dash-btn--ghost"
                        disabled={cancelMutation.isPending}
                        onClick={() =>
                          cancelMutation.mutate({ id: s.id, immediate: true })
                        }
                      >
                        Cancel now
                      </button>
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
