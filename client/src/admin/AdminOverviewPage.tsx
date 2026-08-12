import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
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

type Range = '7d' | '30d' | '90d' | 'month' | 'year' | 'all';

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
  if (value.length >= 10) {
    const day = Number(value.slice(8, 10));
    const monthIdx = Number(value.slice(5, 7)) - 1;
    const mon = MONTHS[monthIdx]?.label.slice(0, 3);
    if (mon && Number.isFinite(day)) return `${day} ${mon}`;
    return value.slice(5);
  }
  return value;
}

function toUtcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toUtcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Fill every day/month in the metrics window so the chart X-axis shows the full range. */
function enumeratePeriodBuckets(
  sinceIso: string,
  untilIso: string,
  grain: 'day' | 'month'
): string[] {
  const since = new Date(sinceIso);
  const until = new Date(untilIso);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since >= until) {
    return [];
  }

  const out: string[] = [];
  if (grain === 'month') {
    const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
    while (cursor < until) {
      out.push(toUtcMonthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      if (out.length > 120) break;
    }
    return out;
  }

  const cursor = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
  );
  while (cursor < until) {
    out.push(toUtcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (out.length > 100) break;
  }
  return out;
}

function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yearMonth}-${String(last).padStart(2, '0')}`;
}

function usersPathForSignupBucket(dateKey: string): string {
  const from = dateKey.length === 7 ? `${dateKey}-01` : dateKey;
  const to = dateKey.length === 7 ? lastDayOfMonth(dateKey) : dateKey;
  const params = new URLSearchParams({ from, to });
  return `/admin/users?${params.toString()}`;
}

export function AdminOverviewPage() {
  const now = new Date();
  const navigate = useNavigate();
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
        : period.range === 'all'
          ? 'All time'
          : period.label;

  const revenueChart = series.revenueDaily.map((d) => ({
    date: formatAxisDate(d.date, grain),
    revenue: d.amountPaise / 100,
    count: d.count,
  }));
  const signupChart = series.signupsDaily.map((d) => ({
    dateKey: d.date,
    date: formatAxisDate(d.date, grain),
    signups: d.count,
  }));
  const jobsByDate = new Map(
    (series.jobsDaily ?? []).map((d) => [d.date, d] as const)
  );
  const jobBuckets = enumeratePeriodBuckets(period.since, period.until, grain);
  const jobsChart =
    jobBuckets.length > 0
      ? jobBuckets.map((key) => {
          const row = jobsByDate.get(key);
          return {
            date: formatAxisDate(key, grain),
            scanned: row?.scanned ?? 0,
            applied: row?.applied ?? 0,
          };
        })
      : (series.jobsDaily ?? []).map((d) => ({
          date: formatAxisDate(d.date, grain),
          scanned: d.scanned,
          applied: d.applied,
        }));
  const jobsAngleLabels = jobsChart.length > 12;

  function openSignupUsers(raw: unknown) {
    const rec = raw as {
      dateKey?: string;
      signups?: number;
      payload?: { dateKey?: string; signups?: number };
      value?: number;
      activePayload?: Array<{ payload?: { dateKey?: string; signups?: number } }>;
    };
    const point = rec?.activePayload?.[0]?.payload ?? rec?.payload ?? rec;
    const dateKey = point?.dateKey;
    const count = Number(point?.signups ?? rec?.value ?? 0);
    if (!dateKey || count <= 0) return;
    navigate(usersPathForSignupBucket(dateKey));
  }

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
            <option value="all">All time</option>
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
          <span>Jobs scanned</span>
          <strong>{(kpis.jobsScanned ?? 0).toLocaleString()}</strong>
          <em>
            {(kpis.jobsScannedPeriod ?? 0).toLocaleString()} in {periodLabel}
            {(kpis.scanSessions ?? 0) > 0
              ? ` · ${kpis.scanSessions.toLocaleString()} sessions`
              : ''}
          </em>
        </div>
        <div className="admin-kpi">
          <span>Jobs matched</span>
          <strong>{(kpis.jobsMatched ?? 0).toLocaleString()}</strong>
          <em>
            {(kpis.jobsMatchedPeriod ?? 0).toLocaleString()} in {periodLabel}
          </em>
        </div>
        <div className="admin-kpi">
          <span>Jobs applied</span>
          <strong>{(kpis.jobsApplied ?? 0).toLocaleString()}</strong>
          <em>
            {(kpis.jobsAppliedPeriod ?? 0).toLocaleString()} in {periodLabel}
          </em>
        </div>
      </div>

      <div className="admin-chart-grid">
        <section className="admin-panel admin-panel--wide">
          <h2>Engine Performance (Scanned vs Applied)</h2>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={jobsAngleLabels ? 320 : 280}>
              <BarChart data={jobsChart} margin={{ bottom: jobsAngleLabels ? 8 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis
                  dataKey="date"
                  interval={0}
                  minTickGap={0}
                  tick={{ fontSize: 12, fill: '#334155' }}
                  angle={jobsAngleLabels ? -40 : 0}
                  textAnchor={jobsAngleLabels ? 'end' : 'middle'}
                  height={jobsAngleLabels ? 64 : 40}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="scanned" fill="#6366f1" name="Jobs Scanned" radius={[4, 4, 0, 0]} />
                <Bar dataKey="applied" fill="#10b981" name="Jobs Applied" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

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
          <p className="admin-note">Click a bar to open those users</p>
          <div className="admin-chart admin-chart--clickable">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={signupChart} onClick={openSignupUsers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  dataKey="signups"
                  fill="#22c55e"
                  name="Signups"
                  cursor="pointer"
                  radius={[4, 4, 0, 0]}
                  onClick={openSignupUsers}
                />
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
        <section className="admin-panel admin-power-users">
          <h2>
            <Zap size={16} aria-hidden />
            Power Users ({periodLabel})
          </h2>
          <ul className="admin-power-users__list">
            {(lists.powerUsers ?? []).map((u) => (
              <li key={u.userId}>
                <span className="admin-power-users__rank">{u.rank}.</span>
                <span className="admin-power-users__name">
                  {u.userName || u.userEmail || '—'}
                </span>
                <span className="admin-power-users__badge">
                  {u.applied.toLocaleString()} applied
                </span>
              </li>
            ))}
            {(lists.powerUsers ?? []).length === 0 ? (
              <li className="muted">No applies in this period</li>
            ) : null}
          </ul>
        </section>
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
