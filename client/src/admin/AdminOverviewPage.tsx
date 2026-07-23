import { useMemo, useState } from 'react';
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

const PIE_COLORS = ['#64748b', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7'];

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
] as const;

type Range = '7d' | '30d' | '90d' | 'month' | 'year';

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= current - 5; y -= 1) years.push(y);
  return years;
}

function formatAxisDate(value: string, grain: 'day' | 'month'): string {
  if (grain === 'month') {
    const [y, m] = value.split('-');
    if (!y || !m) return value;
    return `${MONTHS[Number(m) - 1]?.label.slice(0, 3) ?? m} ${y}`;
  }
  return value.length >= 10 ? value.slice(5) : value;
}

export function AdminOverviewPage() {
  const now = new Date();
  const [range, setRange] = useState<Range>('30d');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const queryParams = useMemo(() => {
    if (range === 'month') return { range, year, month } as const;
    if (range === 'year') return { range, year } as const;
    return { range } as const;
  }, [range, year, month]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['admin', 'metrics', queryParams],
    queryFn: async () => {
      const res = await fetchAdminMetrics(queryParams);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  if (isLoading && !data) {
    return <CosmosLoader label="Loading metrics…" className="cosmos-loader--inline" />;
  }

  if (isError || !data) {
    return <p className="admin-error">Could not load admin metrics.</p>;
  }

  const { kpis, series, lists, period } = data;
  const grain = period.grain;
  const periodLabel =
    period.range === 'month'
      ? `${MONTHS[(period.month ?? 1) - 1]?.label ?? ''} ${period.year}`
      : period.range === 'year'
        ? String(period.year)
        : period.label;

  const revenueChart = series.revenueDaily.map((d) => ({
    date: formatAxisDate(d.date, grain),
    revenue: d.amountPaise / 100,
    count: d.count,
  }));
  const signupChart = series.signupsDaily.map((d) => ({
    date: formatAxisDate(d.date, grain),
    signups: d.count,
  }));

  return (
    <div className="admin-page">
      <div className="admin-filters admin-filters--metrics">
        <label>
          Period
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            aria-label="Metrics period"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </label>

        {range === 'month' || range === 'year' ? (
          <label>
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Year"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {range === 'month' ? (
          <label>
            Month
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label="Month"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isFetching ? <span className="admin-note">Updating…</span> : null}
      </div>

      <div className="admin-kpi-grid">
        <div className="admin-kpi">
          <span>Total users</span>
          <strong>{kpis.totalUsers}</strong>
          <em>+{kpis.newUsers7} / 7d · +{kpis.newUsers30} in period</em>
        </div>
        <div className="admin-kpi">
          <span>Active paid</span>
          <strong>{kpis.activePaid}</strong>
          <em>MRR {formatInr(kpis.mrrPaise)}</em>
        </div>
        <div className="admin-kpi">
          <span>Revenue ({periodLabel})</span>
          <strong>{formatInr(kpis.revenueMtdPaise)}</strong>
          <em>Selected period total</em>
        </div>
        <div className="admin-kpi">
          <span>Failed / churn</span>
          <strong>{kpis.failedPayments}</strong>
          <em>{kpis.churnCancels} cancels in period</em>
        </div>
      </div>

      <div className="admin-chart-grid">
        <section className="admin-panel">
          <h2>Revenue ({periodLabel})</h2>
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
                  stroke="#0ea5e9"
                  fill="#0ea5e933"
                  name="₹"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="admin-panel">
          <h2>Signups ({periodLabel})</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={signupChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="signups" fill="#22c55e" name="Signups" />
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
          <h2>Payment outcomes ({periodLabel})</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={series.paymentOutcomes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#a855f7" name="Count" />
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
