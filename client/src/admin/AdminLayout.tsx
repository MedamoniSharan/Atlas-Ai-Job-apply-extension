import { FormEvent, useEffect, useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Shield,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ensureSession, logout } from '../lib/api';
import { CosmosLogo, CosmosLoader } from '../components/CosmosLogo';

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/admin/users')) return 'Users';
  if (pathname.startsWith('/admin/subscriptions')) return 'Subscriptions';
  if (pathname.startsWith('/admin/payments')) return 'Payments';
  if (pathname.startsWith('/admin/plans')) return 'Plans';
  if (pathname.startsWith('/admin/audit')) return 'Audit log';
  return 'Overview';
}

export function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [sessionReady, setSessionReady] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

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
    setNavOpen(false);
  }, [location.pathname]);

  if (!sessionReady) {
    return (
      <CosmosLoader label="Loading admin…" className="cosmos-loader--shell" />
    );
  }

  if (!accessToken) {
    return <Navigate to="/admin/login" replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className={`admin-shell${navOpen ? ' admin-shell--nav-open' : ''}`}>
      <div
        className="admin-shell__backdrop"
        aria-hidden={!navOpen}
        onClick={() => setNavOpen(false)}
      />

      <aside className="admin-sidebar" aria-label="Admin">
        <div className="admin-sidebar__brand">
          <CosmosLogo className="admin-sidebar__logo" size={26} />
          <div>
            <strong>cosmo</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          <NavLink to="/admin" end className="admin-sidebar__link">
            <LayoutDashboard size={17} strokeWidth={1.9} aria-hidden />
            Overview
          </NavLink>
          <NavLink to="/admin/users" className="admin-sidebar__link">
            <Users size={17} strokeWidth={1.9} aria-hidden />
            Users
          </NavLink>
          <NavLink to="/admin/subscriptions" className="admin-sidebar__link">
            <Wallet size={17} strokeWidth={1.9} aria-hidden />
            Subscriptions
          </NavLink>
          <NavLink to="/admin/payments" className="admin-sidebar__link">
            <Receipt size={17} strokeWidth={1.9} aria-hidden />
            Payments
          </NavLink>
          <NavLink to="/admin/plans" className="admin-sidebar__link">
            <CreditCard size={17} strokeWidth={1.9} aria-hidden />
            Plans
          </NavLink>
          <NavLink to="/admin/audit" className="admin-sidebar__link">
            <ScrollText size={17} strokeWidth={1.9} aria-hidden />
            Audit
          </NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <NavLink to="/dashboard" className="admin-sidebar__link">
            <Shield size={17} strokeWidth={1.9} aria-hidden />
            Back to app
          </NavLink>
          <button
            type="button"
            className="admin-sidebar__signout"
            onClick={() => {
              void logout().finally(() => {
                window.location.replace('/');
              });
            }}
          >
            <LogOut size={14} strokeWidth={2} aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__header">
          <button
            type="button"
            className="admin-shell__menu"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} strokeWidth={1.9} aria-hidden />
          </button>
          <h1>{pageTitle(location.pathname)}</h1>
          <span className="admin-shell__who">{user?.email}</span>
        </header>
        <main className="admin-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Unused helper kept for form patterns in pages */
export function AdminSearchForm({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder: string;
}) {
  return (
    <form className="admin-search" onSubmit={onSubmit}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button type="submit" className="dash-btn dash-btn--ghost">
        Search
      </button>
    </form>
  );
}
