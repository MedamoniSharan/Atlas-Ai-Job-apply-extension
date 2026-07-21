import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  NavLink,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { ensureSession, fetchApplications } from './lib/api';
import { CosmosLogo, CosmosLoader } from './components/CosmosLogo';

export type ShellOutletContext = {
  search: string;
  setSearch: (value: string) => void;
};

function userInitials(name?: string | null): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/get-started')) return 'Get started';
  if (pathname.startsWith('/browse')) return 'Browse jobs';
  if (pathname.startsWith('/inbox')) return 'Inbox';
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

  const outletContext: ShellOutletContext = useMemo(
    () => ({ search, setSearch }),
    [search]
  );

  if (!sessionReady) {
    return <CosmosLoader label="Loading Tsenta…" className="cosmos-loader--shell" />;
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
          <span className="sidebar__name">tsenta</span>
        </div>

        <nav className="sidebar__nav">
          <NavLink to="/dashboard" end className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <DashIcon />
            </span>
            Dashboard
          </NavLink>
          <NavLink to="/browse" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <BrowseIcon />
            </span>
            Browse jobs
          </NavLink>
          <NavLink to="/applications" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <AppsIcon />
            </span>
            Applications
            {typeof appCount === 'number' && appCount > 0 ? (
              <span className="sidebar__badge">{appCount}</span>
            ) : null}
          </NavLink>
          <NavLink to="/inbox" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <InboxIcon />
            </span>
            Inbox
          </NavLink>
          <NavLink to="/tracker" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <TrackerIcon />
            </span>
            Tracker
          </NavLink>
        </nav>

        <nav className="sidebar__nav sidebar__nav--secondary">
          <NavLink to="/profile" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <ProfileIcon />
            </span>
            Profile
          </NavLink>
          <NavLink to="/settings" className="sidebar__link">
            <span className="sidebar__icon" aria-hidden>
              <SettingsIcon />
            </span>
            Settings
          </NavLink>
          {needsSetup ? (
            <NavLink to="/get-started" className="sidebar__link">
              <span className="sidebar__icon" aria-hidden>
                <StartIcon />
              </span>
              Get started
            </NavLink>
          ) : null}
        </nav>

        <div className="sidebar__footer">
          <a
            className="sidebar__help"
            href="mailto:support@tsenta.com?subject=Tsenta%20feedback"
          >
            <span className="sidebar__help-icon" aria-hidden>
              ?
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
              <span>Synced with Naukri</span>
            </div>
            <button
              type="button"
              className="sidebar__signout"
              onClick={() => {
                clearSession();
                navigate('/', { replace: true });
              }}
            >
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
                ? 'so Tsenta can scan and apply on Naukri.'
                : 'to start scanning applications from Naukri.'}
            </p>
            <NavLink className="setup-banner__cta" to="/get-started">
              Set up now
            </NavLink>
          </div>
        )}

        <header className="shell__header">
          <button
            type="button"
            className="shell__menu"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <h1 className="shell__title">{title}</h1>

          {showHeaderSearch ? (
            <form className="shell__search" onSubmit={onSearchSubmit}>
              <span className="shell__search-icon" aria-hidden>
                ⌕
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

          <div className="shell__actions">
            <button
              type="button"
              className="shell__icon-btn"
              aria-label="Notifications"
              title="Notifications coming soon"
            >
              ⌂
            </button>
            <NavLink
              to="/get-started"
              className="shell__icon-btn"
              aria-label="Help"
              title="Get started"
            >
              ?
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

function DashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function BrowseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function AppsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v16H4z" />
      <path d="m4 8 8 6 8-6" />
    </svg>
  );
}

function TrackerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function StartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
