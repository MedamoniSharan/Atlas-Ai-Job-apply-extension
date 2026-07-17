import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <p className="brand">Atlas</p>
        <nav>
          <NavLink
            to="/applications"
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            Applications
          </NavLink>
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
