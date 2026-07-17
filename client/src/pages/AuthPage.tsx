import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login, register } from '../lib/api';
import { useAuthStore } from '../store/authStore';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'login'
          ? await login(email, password)
          : await register(name, email, password);

      if (!result.success) {
        setError(result.message);
        return;
      }

      setSession(result.data);
      navigate('/applications');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand">CodeXCareer</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
        <p className="sub">
          Track applications synced from your browser extension.
        </p>
        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Sign up'}
          </button>
          <p className="error">{error}</p>
        </form>
        <p className="switch">
          {mode === 'login' ? (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
