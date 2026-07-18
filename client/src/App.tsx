import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { ensureSession } from './lib/api';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const { data: onboarding } = useOnboardingStatus();
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureSession().finally(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sessionReady) {
    return null;
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  const needsPrefs = onboarding && !onboarding.preferencesCompleted;
  const needsExtension =
    onboarding &&
    onboarding.preferencesCompleted &&
    !onboarding.extensionConnected &&
    !onboarding.hasApplications;
  const needsSetup = needsPrefs || needsExtension;

  return (
    <div className="app-shell">
      {needsSetup && (
        <div className="setup-banner">
          <p>
            <strong>
              {needsPrefs
                ? 'Set job preferences'
                : 'Install the Chrome extension'}
            </strong>{' '}
            {needsPrefs
              ? 'so Atlas can scan and apply on Naukri.'
              : 'to start scanning applications from Naukri.'}
          </p>
          <NavLink className="setup-banner__cta" to="/get-started">
            Set up now
          </NavLink>
        </div>
      )}
      <header className="topbar">
        <p className="brand">Atlas</p>
        <nav>
          <NavLink
            to="/applications"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Applications
          </NavLink>
          {needsSetup && (
            <NavLink
              to="/get-started"
              className={({ isActive }) =>
                isActive ? 'active setup-nav' : 'setup-nav'
              }
            >
              Get started
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Settings
          </NavLink>
          <span className="muted">{user?.name}</span>
          <button className="linkish" type="button" onClick={clearSession}>
            Sign out
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
