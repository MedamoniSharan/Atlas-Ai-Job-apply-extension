import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAdminMetrics } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

const PIE_COLORS = ['#94a3b8', '#15362b', '#ff4704'];

export function AdminOverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const res = await fetchAdminMetrics(30);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <CosmosLoader label="Loading metrics…" className="cosmos-loader--inline" />;
  }

  if (isError || !data) {
    return <p className="admin-error">Could not load admin metrics.</p>;
  }

  const { kpis, series, lists } = data;
  const revenueChart = series.revenueDaily.map((d) => ({
    date: d.date.slice(5),
    revenue: d.amountPaise / 100,
    count: d.count,
  }));
  const signupChart = series.signupsDaily.map((d) => ({
    date: d.date.slice(5),
    signups: d.count,
  }));

  return (
    <div className="admin-page">
      <div className="admin-kpi-grid">
        <div className="admin-kpi">
          <span>Total users</span>
          <strong>{kpis.totalUsers}</strong>
          <em>+{kpis.newUsers7} / 7d · +{kpis.newUsers30} / 30d</em>
        </div>
        <div className="admin-kpi">
          <span>Active paid</span>
          <strong>{kpis.activePaid}</strong>
          <em>MRR {formatInr(kpis.mrrPaise)}</em>
        </div>
        <div className="admin-kpi">
          <span>Revenue MTD</span>
          <strong>{formatInr(kpis.revenueMtdPaise)}</strong>
          <em>YTD {formatInr(kpis.revenueYtdPaise)}</em>
        </div>
        <div className="admin-kpi">
          <span>Failed / churn</span>
          <strong>{kpis.failedPayments}</strong>
          <em>{kpis.churnCancels} cancels (30d)</em>
        </div>
      </div>

      <div className="admin-chart-grid">
        <section className="admin-panel">
          <h2>Revenue (30d)</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#15362b"
                  fill="#15362b33"
                  name="₹"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="admin-panel">
          <h2>Signups (30d)</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={signupChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="signups" fill="#ff4704" name="Signups" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="admin-panel">
          <h2>Plan mix</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={series.planMix}
                  dataKey="count"
                  nameKey="tier"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {series.planMix.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="admin-panel">
          <h2>Payment outcomes</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={series.paymentOutcomes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#15362b" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="admin-lists-grid">
        <section className="admin-panel">
          <h2>Recent payments</h2>
          <ul className="admin-mini-list">
            {lists.recentPayments.map((p) => (
              <li key={p.id}>
                <strong>{p.userName || p.userEmail || '—'}</strong>
                <span>
                  {p.plan} · {formatInr(p.amountPaise)}
                </span>
              </li>
            ))}
            {lists.recentPayments.length === 0 ? (
              <li className="muted">No payments yet</li>
            ) : null}
          </ul>
        </section>
        <section className="admin-panel">
          <h2>Expiring soon</h2>
          <ul className="admin-mini-list">
            {lists.expiringSoon.map((s) => (
              <li key={s.id}>
                <strong>{s.userName || s.userEmail || '—'}</strong>
                <span>
                  {s.tier}
                  {s.currentPeriodEnd
                    ? ` · ${new Date(s.currentPeriodEnd).toLocaleDateString('en-IN')}`
                    : ''}
                </span>
              </li>
            ))}
            {lists.expiringSoon.length === 0 ? (
              <li className="muted">None in the next 7 days</li>
            ) : null}
          </ul>
        </section>
        <section className="admin-panel">
          <h2>Halted subscriptions</h2>
          <ul className="admin-mini-list">
            {lists.haltedSubs.map((s) => (
              <li key={s.id}>
                <strong>{s.userName || s.userEmail || '—'}</strong>
                <span>{s.tier}</span>
              </li>
            ))}
            {lists.haltedSubs.length === 0 ? (
              <li className="muted">No halted subscriptions</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
