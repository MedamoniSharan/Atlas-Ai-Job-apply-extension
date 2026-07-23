import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  NavLink,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Briefcase,
  CircleHelp,
  Compass,
  LayoutDashboard,
  LogOut,
  Menu,
  Puzzle,
  Search,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import { useAuthStore } from './store/authStore';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { ensureSession, fetchApplications, fetchBillingMe } from './lib/api';
import { CosmosLogo, CosmosLoader } from './components/CosmosLogo';
import { ShimmerButton } from './components/ui/ShimmerButton';

export type ShellOutletContext = {
  search: string;
  setSearch: (value: string) => void;
};

const PLAN_LABEL = {
  free: 'Basic',
  pro: 'Premium',
  max: 'UltraMag',
} as const;

function userInitials(name?: string | null): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function ShellClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <time
      className="shell__clock"
      dateTime={now.toISOString()}
      title={`${dateLabel} · ${timeLabel}`}
    >
      <span className="shell__clock-date">{dateLabel}</span>
      <span className="shell__clock-time">{timeLabel}</span>
    </time>
  );
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/get-extension') || pathname.startsWith('/get-started')) {
    return 'Get extension';
  }
  if (pathname.startsWith('/browse')) return 'Browse jobs';
  if (pathname.startsWith('/tracker')) return 'Tracker';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/applications')) return 'Applications';
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  return 'Dashboard';
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { data: onboarding } = useOnboardingStatus();
  const [sessionReady, setSessionReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void ensureSession().finally(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const { data: appCount } = useQuery({
    queryKey: ['applications', 'nav-count'],
    queryFn: async () => {
      const res = await fetchApplications({ page: 1, limit: 1 });
      if (!res.success) return 0;
      return res.data.total;
    },
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const { data: billing } = useQuery({
    queryKey: ['billing', 'me'],
    queryFn: async () => {
      const res = await fetchBillingMe();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });

  const planKey = billing?.plan ?? user?.plan ?? 'free';
  const planLabel = PLAN_LABEL[planKey];

  const outletContext: ShellOutletContext = useMemo(
    () => ({ search, setSearch }),
    [search]
  );

  if (!sessionReady) {
    return <CosmosLoader label="Loading Cosmo…" className="cosmos-loader--shell" />;
  }

  if (!accessToken) {
    return <Navigate to="/" replace />;
  }

  const needsPrefs = onboarding && !onboarding.preferencesCompleted;
  const needsExtension =
    onboarding &&
    onboarding.preferencesCompleted &&
    !onboarding.extensionConnected &&
    !onboarding.hasApplications;
  const needsSetup = needsPrefs || needsExtension;
  const title = pageTitle(location.pathname);
  const showHeaderSearch =
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/applications');

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (
      !location.pathname.startsWith('/dashboard') &&
      !location.pathname.startsWith('/applications')
    ) {
      navigate('/dashboard');
    }
  }

  return (
    <div className={`shell${sidebarOpen ? ' shell--nav-open' : ''}`}>
      <div
        className="shell__backdrop"
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar__brand">
          <CosmosLogo className="sidebar__logo" size={28} />
          <span className="sidebar__name">cosmo</span>
        </div>

        <nav className="sidebar__nav">
          <NavLink to="/dashboard" end className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <LayoutDashboard size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Dashboard
          </NavLink>
          <NavLink to="/applications" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <Briefcase size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Applications
            {typeof appCount === 'number' && appCount > 0 ? (
              <span className="sidebar__badge">{appCount}</span>
            ) : null}
          </NavLink>
          <NavLink to="/tracker" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <BarChart3 size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Tracker
          </NavLink>
          <NavLink to="/browse" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <Compass size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Browse jobs
          </NavLink>
        </nav>

        <nav className="sidebar__nav sidebar__nav--secondary">
          <NavLink to="/profile" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <User size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Profile
          </NavLink>
          <NavLink to="/settings" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <Settings size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Settings
          </NavLink>
          {user?.role === 'admin' ? (
            <NavLink to="/admin" className="sidebar__link">
              <span className="sidebar__icon" aria-hidden>
                <Shield size={18} strokeWidth={1.9} className="icon-motion" />
              </span>
              Admin
            </NavLink>
          ) : null}
          <NavLink to="/get-extension" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <Puzzle size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            Get extension
          </NavLink>
        </nav>

        <div className="sidebar__footer">
          <a
            className="sidebar__help"
            href="mailto:support@cosmovai.com?subject=Cosmo%20feedback"
          >
            <span className="sidebar__help-icon" aria-hidden>
              <CircleHelp size={18} strokeWidth={1.9} className="icon-motion" />
            </span>
            <span>
              <strong>Help &amp; Support</strong>
              <span className="sidebar__help-sub">Send feedback</span>
            </span>
          </a>

          <div className="sidebar__user">
            <div className="sidebar__avatar" aria-hidden>
              {userInitials(user?.name)}
            </div>
            <div className="sidebar__user-meta">
              <strong>{user?.name || 'Account'}</strong>
              <span className={`sidebar__plan sidebar__plan--${planKey}`}>
                {planLabel}
              </span>
            </div>
            <button
              type="button"
              className="sidebar__signout"
              onClick={() => {
                clearSession();
                window.location.replace('/');
              }}
            >
              <LogOut size={14} strokeWidth={2} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="shell__main">
        {needsSetup && (
          <div className="setup-banner">
            <p>
              <strong>
                {needsPrefs
                  ? 'Set job preferences'
                  : 'Install the Chrome extension'}
              </strong>{' '}
              {needsPrefs
                ? 'so Cosmo can scan and apply on Naukri.'
                : 'to start scanning applications from Naukri.'}
            </p>
            <ShimmerButton to="/get-extension">Set up now</ShimmerButton>
          </div>
        )}

        <header className="shell__header">
          <button
            type="button"
            className="shell__menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} strokeWidth={1.9} className="icon-motion" aria-hidden />
          </button>
          <h1 className="shell__title">{title}</h1>

          {showHeaderSearch ? (
            <form className="shell__search" onSubmit={onSearchSubmit}>
              <span className="shell__search-icon" aria-hidden>
                <Search size={16} strokeWidth={2} className="icon-motion" />
              </span>
              <input
                type="search"
                placeholder="Search by title, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search applications"
              />
            </form>
          ) : (
            <div className="shell__search-spacer" />
          )}

          <ShellClock />

          <div className="shell__actions">
            <button
              type="button"
              className="shell__icon-btn"
              aria-label="Notifications"
              title="Notifications coming soon"
            >
              <Bell size={18} strokeWidth={1.8} className="icon-motion" aria-hidden />
            </button>
            <NavLink
              to="/get-extension"
              className="shell__icon-btn"
              aria-label="Get extension"
              title="Get extension"
            >
              <CircleHelp size={18} strokeWidth={1.8} className="icon-motion" aria-hidden />
            </NavLink>
          </div>
        </header>

        <main className="shell__content">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}



