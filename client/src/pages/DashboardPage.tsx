import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  Target,
} from 'lucide-react';
import { fetchApplications, fetchBillingMe } from '../lib/api';
import { useApplicationSocket } from '../lib/socket';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import {
  ActivityTimeline,
  appsToTimeline,
  CongratulationsBadgeCard,
  GrowthRadialCard,
  JobsExtensionStatsCard,
  ProfileReportCard,
  SalesStatsCard,
  type StatsRow,
} from '../components/dashboard';
import { useAuthStore } from '../store/authStore';

const PLAN_LABEL = {
  free: 'Basic',
  pro: 'Premium',
  max: 'UltraMag',
} as const;

function pctOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 10_000) / 100;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: onboarding } = useOnboardingStatus();

  const { data: matchData } = useQuery({
    queryKey: ['applications', 'top-matches'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 8,
        bucket: 'matched',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: appliedStats } = useQuery({
    queryKey: ['applications', 'applied-count'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 1,
        bucket: 'applied',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: skippedStats } = useQuery({
    queryKey: ['applications', 'skipped-count'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 1,
        bucket: 'skipped',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: companySiteStats } = useQuery({
    queryKey: ['applications', 'company-site-count'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 1,
        bucket: 'company_site',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: allStats } = useQuery({
    queryKey: ['applications', 'all-count'],
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 1, bucket: 'all' });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: recentApps } = useQuery({
    queryKey: ['applications', 'recent-activity'],
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 6, bucket: 'all' });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: autoApplyStats } = useQuery({
    queryKey: ['applications', 'auto-apply-count'],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 1,
        source: 'auto_apply',
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: billing } = useQuery({
    queryKey: ['billing', 'me'],
    queryFn: async () => {
      const res = await fetchBillingMe();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const onUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['applications'] });
    void queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
  }, [queryClient]);

  useApplicationSocket(onUpdate);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const jobsCount = allStats?.total ?? 0;
  const appliedCount = appliedStats?.total ?? 0;
  const matchedCount = matchData?.total ?? 0;
  const skippedCount = skippedStats?.total ?? 0;
  const companySiteCount = companySiteStats?.total ?? 0;
  const autoApplyCount = autoApplyStats?.total ?? 0;
  const usage = billing?.appliesUsed ?? 0;
  const usageLimit = billing?.appliesLimit ?? 0;
  const usagePct =
    usageLimit > 0 ? Math.min(100, Math.round((usage / usageLimit) * 100)) : 0;
  const planKey = billing?.plan ?? user?.plan ?? 'free';
  const planLabel = PLAN_LABEL[planKey];
  const subEnd =
    billing?.subscription?.currentPeriodEnd ?? billing?.planExpiresAt ?? null;
  const subEndLabel = subEnd
    ? new Date(subEnd).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : planKey === 'free'
      ? 'No plan'
      : '—';

  const matchRate =
    jobsCount > 0 ? Math.min(100, Math.round((matchedCount / jobsCount) * 100)) : 0;
  const applyRate =
    jobsCount > 0 ? Math.min(100, Math.round((appliedCount / jobsCount) * 100)) : 0;
  const conversionPct =
    matchedCount > 0
      ? Math.min(100, Math.round((appliedCount / matchedCount) * 100))
      : applyRate;

  const timelineItems = useMemo(
    () => appsToTimeline(recentApps?.items ?? []),
    [recentApps?.items],
  );

  const jobsRows = useMemo<StatsRow[]>(() => {
    const total = Math.max(jobsCount, 1);
    return [
      {
        id: 'applied',
        label: 'Applied',
        count: appliedCount,
        pct: pctOf(appliedCount, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--green',
        icon: 'applied',
      },
      {
        id: 'matched',
        label: 'Matched',
        count: matchedCount,
        pct: pctOf(matchedCount, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--teal',
        icon: 'matched',
      },
      {
        id: 'company',
        label: 'Company site',
        count: companySiteCount,
        pct: pctOf(companySiteCount, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--blue',
        icon: 'company',
      },
      {
        id: 'skipped',
        label: 'Skipped',
        count: skippedCount,
        pct: pctOf(skippedCount, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--orange',
        icon: 'skipped',
      },
      {
        id: 'auto',
        label: 'Auto apply',
        count: autoApplyCount,
        pct: pctOf(autoApplyCount, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--ink',
        icon: 'auto',
      },
    ];
  }, [
    appliedCount,
    matchedCount,
    companySiteCount,
    skippedCount,
    autoApplyCount,
    jobsCount,
  ]);

  const extensionRows = useMemo<StatsRow[]>(() => {
    const connected = Boolean(onboarding?.extensionConnected);
    const prefs = Boolean(onboarding?.preferencesCompleted);
    const chromeReady = Boolean(import.meta.env.VITE_CHROME_EXTENSION_URL);
    const edgeReady = Boolean(import.meta.env.VITE_EDGE_EXTENSION_URL);
    const firefoxReady = Boolean(import.meta.env.VITE_FIREFOX_EXTENSION_URL);
    const storeTotal = Math.max(
      Number(chromeReady) + Number(edgeReady) + Number(firefoxReady),
      1,
    );

    return [
      {
        id: 'chrome',
        label: 'Chrome',
        count: chromeReady ? (connected ? Math.max(usage, 1) : 0) : 0,
        pct: chromeReady
          ? connected
            ? 100
            : pctOf(1, storeTotal)
          : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--green',
        icon: 'chrome',
      },
      {
        id: 'edge',
        label: 'Edge',
        count: edgeReady ? 1 : 0,
        pct: edgeReady ? pctOf(1, storeTotal) : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--blue',
        icon: 'edge',
      },
      {
        id: 'firefox',
        label: 'Firefox',
        count: firefoxReady ? 1 : 0,
        pct: firefoxReady ? pctOf(1, storeTotal) : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--orange',
        icon: 'firefox',
      },
      {
        id: 'connected',
        label: 'Connected',
        count: connected ? 1 : 0,
        pct: connected ? 100 : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--teal',
        icon: 'connect',
      },
      {
        id: 'prefs',
        label: 'Preferences set',
        count: prefs ? 1 : 0,
        pct: prefs ? 100 : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--ink',
        icon: 'matched',
      },
      {
        id: 'usage',
        label: 'Applies used',
        count: usage,
        pct: usageLimit > 0 ? pctOf(usage, usageLimit) : usage > 0 ? 100 : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--green',
        icon: 'auto',
      },
    ];
  }, [onboarding, usage, usageLimit]);

  return (
    <div className="dash">
      <div className="dash-board">
        <div className="dash-board__main">
          <CongratulationsBadgeCard
            name={firstName}
            matchedCount={matchedCount}
            appliedCount={appliedCount}
          />

          <div className="dash-board__mid">
            <GrowthRadialCard
              usagePct={usagePct}
              applyRate={applyRate}
              usage={usage}
              usageLimit={usageLimit}
              appliedCount={appliedCount}
              jobsCount={jobsCount}
            />
            <SalesStatsCard
              conversionPct={conversionPct}
              totalJobs={jobsCount}
              appliedCount={appliedCount}
            />
          </div>
        </div>

        <aside className="dash-board__side" aria-label="Key metrics">
          <article className="dash-stat-card">
            <span className="dash-stat-card__icon" aria-hidden>
              <Briefcase size={18} strokeWidth={2} />
            </span>
            <span className="dash-stat-card__label">Jobs</span>
            <strong className="dash-stat-card__value">{jobsCount}</strong>
            <em className="dash-stat-card__meta">{matchedCount} matched</em>
          </article>

          <article className="dash-stat-card">
            <span className="dash-stat-card__icon dash-stat-card__icon--naukri" aria-hidden>
              <img src="/naukri-logo.png" alt="" width={22} height={22} />
            </span>
            <span className="dash-stat-card__label">Applied</span>
            <strong className="dash-stat-card__value">{appliedCount}</strong>
            <em className="dash-stat-card__meta">Auto + tracked</em>
          </article>

          <article className="dash-stat-card">
            <span className="dash-stat-card__icon" aria-hidden>
              <Target size={18} strokeWidth={2} />
            </span>
            <span className="dash-stat-card__label">Limit</span>
            <strong className="dash-stat-card__value">
              {usageLimit === 0 ? '∞' : usageLimit}
            </strong>
            <em className="dash-stat-card__meta">{planLabel} plan</em>
          </article>

          <article className="dash-stat-card">
            <span className="dash-stat-card__icon" aria-hidden>
              <CalendarDays size={18} strokeWidth={2} />
            </span>
            <span className="dash-stat-card__label">Subscription</span>
            <strong className="dash-stat-card__value dash-stat-card__value--sm">
              {subEndLabel}
            </strong>
            <em className="dash-stat-card__meta">
              {billing?.subscription?.cancelAtPeriodEnd
                ? 'Cancels at period end'
                : planKey === 'free'
                  ? 'Upgrade anytime'
                  : 'Renews automatically'}
            </em>
          </article>

          <ProfileReportCard matchRate={matchRate} jobsCount={jobsCount} />
        </aside>
      </div>

      <div className="dash-board__bottom">
        <ActivityTimeline items={timelineItems} />
        <JobsExtensionStatsCard jobsRows={jobsRows} extensionRows={extensionRows} />
      </div>
    </div>
  );
}
