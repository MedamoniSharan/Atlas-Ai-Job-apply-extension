import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Target, Search } from 'lucide-react';
import {
  fetchApplications,
  fetchApplicationStats,
  fetchBillingMe,
  fetchScanStats,
} from '../lib/api';
import {
  DASH_PERIODS,
  dashPeriodRange,
  type DashPeriod,
} from '../lib/dashboardPeriod';
import { useApplicationSocket } from '../lib/socket';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import {
  ActivityTimeline,
  appsToTimeline,
  CongratulationsBadgeCard,
  GrowthRadialCard,
  JobsExtensionStatsCard,
  JobsStudyLottie,
  ProfileReportCard,
  SalesStatsCard,
  SubscriptionCelebrate,
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
  const [statsPeriod, setStatsPeriod] = useState<DashPeriod>(DASH_PERIODS[0]);
  const periodRange = useMemo(
    () => dashPeriodRange(statsPeriod),
    [statsPeriod],
  );
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: appStats } = useQuery({
    queryKey: [
      'applications',
      'stats',
      statsPeriod,
      periodRange.from,
      periodRange.to,
    ],
    queryFn: async () => {
      const res = await fetchApplicationStats({
        from: periodRange.from,
        to: periodRange.to,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: recentApps } = useQuery({
    queryKey: [
      'applications',
      'recent-activity',
      statsPeriod,
      periodRange.from,
      periodRange.to,
    ],
    queryFn: async () => {
      const res = await fetchApplications({
        page: 1,
        limit: 6,
        bucket: 'all',
        from: periodRange.from,
        to: periodRange.to,
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

  const { data: scanStats } = useQuery({
    queryKey: [
      'scan-sessions',
      'stats',
      statsPeriod,
      periodRange.from,
      periodRange.to,
    ],
    queryFn: async () => {
      const res = await fetchScanStats({
        limit: 10,
        from: periodRange.from,
        to: periodRange.to,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const onUpdate = useCallback(() => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    // Coalesce socket bursts during co-pilot into one refetch wave.
    invalidateTimer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ['applications', 'stats'] });
      void queryClient.invalidateQueries({
        queryKey: ['applications', 'recent-activity'],
      });
      void queryClient.invalidateQueries({ queryKey: ['applications', 'nav-count'] });
      void queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['scan-sessions'] });
    }, 1500);
  }, [queryClient]);

  useEffect(() => {
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    };
  }, []);

  useApplicationSocket(onUpdate);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const jobsCount = appStats?.period.all ?? 0;
  const appliedCount = appStats?.period.applied ?? 0;
  const matchedCount = appStats?.period.matched ?? 0;
  const skippedCount = appStats?.period.skipped ?? 0;
  const companySiteCount = appStats?.period.company_site ?? 0;
  const autoApplyCount = appStats?.period.auto_apply ?? 0;
  const lifetimeJobsCount = appStats?.lifetime.all ?? 0;
  const lifetimeAppliedCount = appStats?.lifetime.applied ?? 0;
  const scannedTotal = scanStats?.totals.scanned ?? 0;
  const scannedWindow = scanStats?.window.scanned ?? 0;
  const scanMatchedTotal = scanStats?.totals.matched ?? 0;
  const scanMatchedWindow = scanStats?.window.matched ?? 0;
  const scanAppliedTotal = scanStats?.totals.applied ?? 0;
  const scanAppliedWindow = scanStats?.window.applied ?? 0;
  const scanSkippedTotal = scanStats?.totals.skipped ?? 0;
  const scanSessionsTotal = scanStats?.totals.sessions ?? 0;
  const usage = billing?.appliesUsed ?? 0;
  const usageLimit = billing?.appliesLimit ?? 0;
  const creditsLeft = Math.max(0, usageLimit - usage);
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

  const daysLeft = (() => {
    if (!subEnd || planKey === 'free') return null;
    const end = new Date(subEnd);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - startOfToday.getTime()) / 86_400_000);
  })();

  const daysLeftLabel =
    daysLeft == null
      ? null
      : daysLeft < 0
        ? 'Expired'
        : daysLeft === 0
          ? 'Ends today'
          : daysLeft === 1
            ? '1 day left'
            : `${daysLeft} days left`;

  const subscriptionMeta = (() => {
    if (planKey === 'free') return 'Upgrade anytime';
    const sub = billing?.subscription;
    if (billing?.subscription?.cancelAtPeriodEnd) return 'Ends on this date';
    // Only Razorpay recurring subscriptions auto-renew.
    if (
      sub?.source === 'razorpay' &&
      sub.razorpaySubscriptionId &&
      !sub.cancelAtPeriodEnd
    ) {
      return 'Renews automatically';
    }
    return subEnd ? 'Active until this date' : 'Active plan';
  })();

  const applyRate =
    scannedWindow > 0
      ? Math.min(100, Math.round((scanAppliedWindow / scannedWindow) * 100))
      : 0;

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

  const scanRows = useMemo<StatsRow[]>(() => {
    const total = Math.max(scannedTotal, 1);
    return [
      {
        id: 'scanned',
        label: 'Scanned',
        count: scannedTotal,
        pct: 100,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--purple',
        icon: 'scanned',
      },
      {
        id: 'scan-matched',
        label: 'Matched',
        count: scanMatchedTotal,
        pct: pctOf(scanMatchedTotal, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--teal',
        icon: 'matched',
      },
      {
        id: 'scan-applied',
        label: 'Applied',
        count: scanAppliedTotal,
        pct: pctOf(scanAppliedTotal, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--green',
        icon: 'applied',
      },
      {
        id: 'scan-skipped',
        label: 'Skipped',
        count: scanSkippedTotal,
        pct: pctOf(scanSkippedTotal, total),
        barClass: 'dash-breakdown__fill dash-breakdown__fill--orange',
        icon: 'skipped',
      },
      {
        id: 'sessions',
        label: 'Sessions',
        count: scanSessionsTotal,
        pct:
          scanSessionsTotal > 0
            ? pctOf(scanSessionsTotal, Math.max(scanSessionsTotal, 1))
            : 0,
        barClass: 'dash-breakdown__fill dash-breakdown__fill--ink',
        icon: 'auto',
      },
    ];
  }, [
    scannedTotal,
    scanMatchedTotal,
    scanAppliedTotal,
    scanSkippedTotal,
    scanSessionsTotal,
  ]);

  const extensionRows = useMemo<StatsRow[]>(() => {
    const connected = Boolean(onboarding?.extensionConnected);
    const prefs = Boolean(onboarding?.preferencesCompleted);
    const chromeReady = true;
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
              period={statsPeriod}
              onPeriodChange={setStatsPeriod}
              usagePct={usagePct}
              usage={usage}
              usageLimit={usageLimit}
              creditsLeft={creditsLeft}
              applyRate={applyRate}
              appliedCount={scanAppliedWindow}
              scannedCount={scannedWindow}
            />
            <SalesStatsCard
              period={statsPeriod}
              onPeriodChange={setStatsPeriod}
              scannedCount={scannedWindow}
              matchedCount={scanMatchedWindow}
            />
          </div>
        </div>

        <aside className="dash-board__side" aria-label="Key metrics">
          <article className="dash-stat-card dash-stat-card--jobs">
            <div className="dash-stat-card__text">
              <span className="dash-stat-card__label">Jobs</span>
              <strong className="dash-stat-card__value">{jobsCount}</strong>
              <em className="dash-stat-card__meta">{matchedCount} matched</em>
            </div>
            <JobsStudyLottie />
          </article>

          <article className="dash-stat-card dash-stat-card--scanned">
            <span className="dash-stat-card__icon" aria-hidden>
              <Search size={18} strokeWidth={2} />
            </span>
            <span className="dash-stat-card__label">Scanned</span>
            <strong className="dash-stat-card__value">{scannedTotal}</strong>
            <em className="dash-stat-card__meta">
              {scannedWindow.toLocaleString()} {statsPeriod.toLowerCase()}
            </em>
          </article>

          <article className="dash-stat-card dash-stat-card--applied">
            <span className="dash-stat-card__icon dash-stat-card__icon--naukri" aria-hidden>
              <img src="/naukri-logo.png" alt="" width={22} height={22} />
            </span>
            <span className="dash-stat-card__label">Applied</span>
            <strong className="dash-stat-card__value">{appliedCount}</strong>
            <em className="dash-stat-card__meta">Auto + tracked</em>
          </article>

          <article className="dash-stat-card dash-stat-card--limit">
            <span className="dash-stat-card__icon" aria-hidden>
              <Target size={18} strokeWidth={2} />
            </span>
            <span className="dash-stat-card__label">Limit</span>
            <strong className="dash-stat-card__value">
              {usageLimit === 0 ? '∞' : usageLimit}
            </strong>
            <em className="dash-stat-card__meta">{planLabel} plan</em>
          </article>

          <article className="dash-stat-card dash-stat-card--subscription">
            <div className="dash-stat-card__text">
              <span className="dash-stat-card__label">Subscription</span>
              <strong className="dash-stat-card__value dash-stat-card__value--sm">
                {subEndLabel}
              </strong>
              <em className="dash-stat-card__meta">
                {daysLeftLabel
                  ? `${daysLeftLabel} · ${subscriptionMeta}`
                  : subscriptionMeta}
              </em>
            </div>
            <SubscriptionCelebrate />
          </article>

          <ProfileReportCard
            jobsCount={lifetimeJobsCount}
            appliedCount={lifetimeAppliedCount}
          />
        </aside>
      </div>

      <div className="dash-board__bottom">
        <ActivityTimeline items={timelineItems} />
        <JobsExtensionStatsCard
          jobsRows={jobsRows}
          scanRows={scanRows}
          extensionRows={extensionRows}
        />
      </div>
    </div>
  );
}
