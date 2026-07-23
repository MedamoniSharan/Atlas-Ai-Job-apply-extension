import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { login } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader, CosmosLogo } from '../components/CosmosLogo';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (accessToken && user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (!result.success) {
        setError(result.message);
        return;
      }

      if (result.data.user.role !== 'admin') {
        clearSession();
        setError('This account is not an admin. Use the regular Google sign-in.');
        return;
      }

      setSession(result.data);
      navigate('/admin', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <div className="admin-login__brand">
          <CosmosLogo size={32} />
          <div>
            <strong>cosmo</strong>
            <span>
              <Shield size={12} strokeWidth={2.2} aria-hidden />
              Admin sign in
            </span>
          </div>
        </div>

        <h1>Admin login</h1>
        <p className="admin-login__lede">
          Sign in with your admin email and password. Google OAuth is for members only.
        </p>

        <form onSubmit={onSubmit} noValidate className="admin-login__form">
          <label htmlFor="admin-email">
            Email
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="admin@cosmo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label htmlFor="admin-password">
            Password
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? (
              <CosmosLoader label="" size={20} className="auth-submit-loader" />
            ) : (
              'Sign in to admin'
            )}
          </button>

          {error ? (
            <p className="admin-login__error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <p className="admin-login__footer">
          Looking for the member app? <Link to="/login">Continue with Google</Link>
        </p>
      </div>
    </div>
  );
}
