import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminUser,
  fetchAdminUsers,
  setAdminUserPlan,
  patchAdminUser,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';
import type { PaidPlan } from '@atlas/shared';

export function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: async () => {
      const res = await fetchAdminUsers({ q: search || undefined, page });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  const detail = useQuery({
    queryKey: ['admin', 'user', selectedId],
    queryFn: async () => {
      const res = await fetchAdminUser(selectedId!);
      if (!res.success) throw new Error(res.message);
      return res.data as {
        id: string;
        name: string;
        email: string;
        role: string;
        status: string;
        plan: string;
        planExpiresAt: string | null;
        subscription: { id: string; status: string; tier: string } | null;
        payments: Array<{ id: string; plan: string; amountPaise: number; status: string }>;
      };
    },
    enabled: Boolean(selectedId),
  });

  const planMutation = useMutation({
    mutationFn: async (body: {
      action: 'grant' | 'extend' | 'revoke';
      plan?: PaidPlan;
      days?: number;
    }) => {
      if (!selectedId) return;
      const res = await setAdminUserPlan(selectedId, body);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', selectedId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: 'active' | 'suspended') => {
      if (!selectedId) return;
      const res = await patchAdminUser(selectedId, { status });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', selectedId] });
    },
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(q.trim());
  }

  return (
    <div className="admin-page admin-page--split">
      <div className="admin-panel">
        <form className="admin-search" onSubmit={onSearch}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
          />
          <button type="submit" className="dash-btn dash-btn--ghost">
            Search
          </button>
        </form>

        {isLoading ? (
          <CosmosLoader label="Loading users…" className="cosmos-loader--inline" />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((u) => (
                  <tr
                    key={u.id}
                    className={selectedId === u.id ? 'is-selected' : ''}
                    onClick={() => setSelectedId(u.id)}
                  >
                    <td>
                      <strong>{u.name}</strong>
                      <div className="muted">{u.email}</div>
                    </td>
                    <td>{u.plan}</td>
                    <td>{u.role}</td>
                    <td>{u.status}</td>
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
              Page {data.page} / {data.totalPages} ({data.total})
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

      <aside className="admin-panel admin-drawer">
        {!selectedId ? (
          <p className="muted">Select a user to manage plan and status.</p>
        ) : detail.isLoading ? (
          <CosmosLoader label="Loading…" className="cosmos-loader--inline" />
        ) : detail.data ? (
          <>
            <h2>{detail.data.name}</h2>
            <p className="muted">{detail.data.email}</p>
            <dl className="admin-dl">
              <div>
                <dt>Plan</dt>
                <dd>
                  {detail.data.plan}
                  {detail.data.planExpiresAt
                    ? ` · until ${new Date(detail.data.planExpiresAt).toLocaleDateString('en-IN')}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{detail.data.role}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detail.data.status}</dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd>
                  {detail.data.subscription
                    ? `${detail.data.subscription.tier} · ${detail.data.subscription.status}`
                    : '—'}
                </dd>
              </div>
            </dl>

            <div className="admin-actions">
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={planMutation.isPending}
                onClick={() =>
                  planMutation.mutate({ action: 'grant', plan: 'pro', days: 30 })
                }
              >
                Grant Pro 30d
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={planMutation.isPending}
                onClick={() =>
                  planMutation.mutate({ action: 'grant', plan: 'max', days: 30 })
                }
              >
                Grant Max 30d
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                disabled={planMutation.isPending}
                onClick={() =>
                  planMutation.mutate({ action: 'extend', days: 30 })
                }
              >
                Extend 30d
              </button>
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                disabled={planMutation.isPending}
                onClick={() => planMutation.mutate({ action: 'revoke' })}
              >
                Revoke to free
              </button>
              {detail.data.status === 'suspended' ? (
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate('active')}
                >
                  Unsuspend
                </button>
              ) : (
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate('suspended')}
                >
                  Suspend
                </button>
              )}
            </div>

            {(planMutation.error || statusMutation.error) && (
              <p className="admin-error">
                {(planMutation.error || statusMutation.error)?.message}
              </p>
            )}

            <h3>Recent payments</h3>
            <ul className="admin-mini-list">
              {detail.data.payments?.map((p) => (
                <li key={p.id}>
                  <strong>{p.plan}</strong>
                  <span>
                    ₹{(p.amountPaise / 100).toFixed(0)} · {p.status}
                  </span>
                </li>
              ))}
              {!detail.data.payments?.length ? (
                <li className="muted">No payments</li>
              ) : null}
            </ul>
          </>
        ) : (
          <p className="admin-error">Failed to load user</p>
        )}
      </aside>
    </div>
  );
}
