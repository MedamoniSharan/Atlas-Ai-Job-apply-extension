import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, register } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader, CosmosMark } from '../components/CosmosLogo';
import '../styles/landing-fonts.css';

type Mode = 'login' | 'register';

type CompanyLogo = {
  name: string;
  src: string;
};

const companyLogos: CompanyLogo[] = [
  {
    name: 'Airbnb',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/airbnb.png',
  },
  {
    name: 'Notion',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/notion.png',
  },
  {
    name: 'Spotify',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/spotify_green.png',
  },
  {
    name: 'Stripe',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/stripe.png',
  },
  {
    name: 'Slack',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/slack.png',
  },
  {
    name: 'Visa',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/visa.png',
  },
  {
    name: 'Netflix',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/netflix.png',
  },
  {
    name: 'OpenAI',
    src: 'https://simplify.jobs/cdn-cgi/image/width=256/images/landing/logos/openai.png',
  },
];

const PEOPLE_PREVIEW =
  'https://simplify.jobs/cdn-cgi/image/width=256/https://assets.simplify.jobs/people_previews.png';

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="27" height="27" viewBox="0 0 48 48" role="img">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4c-7.682 0-14.344 4.337-17.694 10.691Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </svg>
  );
}

function AuthPromoPanel() {
  return (
    <aside className="auth-promo" aria-labelledby="auth-promo-heading">
      <div className="auth-promo__content">
        <header className="auth-promo__brand-row">
          <Link to="/" className="auth-brand" aria-label="Cosmo home">
            <CosmosMark logoSize={28} />
          </Link>
        </header>

        <section className="auth-promo__headline" aria-labelledby="auth-promo-heading">
          <h1 id="auth-promo-heading">Apply to jobs in 1-click.</h1>
          <h2>Power your entire job search, with our recruiter-approved AI.</h2>
        </section>

        <section className="auth-promo__trust" aria-labelledby="auth-trust-heading">
          <h3 id="auth-trust-heading">Browse handpicked jobs from the best companies</h3>
          <p className="auth-promo__trust-line">
            <img
              src={PEOPLE_PREVIEW}
              alt=""
              width={100}
              height={20}
              className="auth-promo__people-image"
              loading="lazy"
              decoding="async"
            />
            <span>Trusted by 1,000,000+ job seekers</span>
          </p>
        </section>

        <ul className="auth-promo__companies" aria-label="Companies hiring on Cosmo">
          {companyLogos.map((company) => (
            <li key={company.name} className="auth-promo__company-tile">
              <img
                src={company.src}
                alt={company.name}
                width={70}
                height={20}
                loading="lazy"
                decoding="async"
              />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
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
      const next = new URLSearchParams(location.search).get('next');
      if (next && next.startsWith('/')) {
        const [pathname, hash] = next.split('#');
        navigate({
          pathname: pathname || '/',
          hash: hash || undefined,
        });
      } else {
        navigate(mode === 'register' ? '/get-started' : '/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <AuthPromoPanel />

      <main className="auth-form-shell">
        <section className="auth-form-panel" aria-labelledby="auth-form-title">
          <div className="auth-form-panel__mobile-brand" aria-label="Cosmo home">
            <Link to="/" className="auth-brand">
              <CosmosMark logoSize={24} />
            </Link>
          </div>

          <h1 id="auth-form-title">
            {mode === 'login' ? 'Login to your account' : 'Create your account'}
          </h1>
          <p className="auth-form-panel__tagline">Apply to jobs in 1-click.</p>
          <p className="auth-form-panel__description">
            Power your entire job search, with our recruiter-approved AI.
          </p>

          <div className="auth-social-stack" aria-label="Social sign in options">
            <button
              type="button"
              className="auth-social-button"
              aria-label="Continue with Google"
              onClick={() =>
                setNotice('Google sign-in is coming soon — use email for now.')
              }
            >
              <GoogleMark />
              <span>Continue with Google</span>
            </button>
          </div>

          <div className="auth-divider" role="separator">
            <span>Or {mode === 'login' ? 'login' : 'sign up'} with your email</span>
          </div>

          <form onSubmit={onSubmit} noValidate>
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field auth-field--password">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {mode === 'login' ? (
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() =>
                    setNotice('Password reset is coming soon — contact support if you are locked out.')
                  }
                >
                  Forgot your password?
                </button>
              ) : null}
            </div>

            {mode === 'login' ? (
              <div className="auth-form-options">
                <label className="auth-remember-label" htmlFor="rememberDevice">
                  <input
                    id="rememberDevice"
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Remember this device</span>
                </label>
                <button
                  className="auth-help-button"
                  type="button"
                  aria-label="Password help"
                  onClick={() =>
                    setNotice('Use the password associated with your Cosmo account.')
                  }
                >
                  <span aria-hidden="true">?</span>
                </button>
              </div>
            ) : null}

            <button className="auth-submit-button" type="submit" disabled={loading}>
              {loading ? (
                <CosmosLoader label="" size={22} className="auth-submit-loader" />
              ) : mode === 'login' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </button>

            {error ? (
              <p className="error auth-status-message" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="auth-status-message" role="status">
                {notice}
              </p>
            ) : null}

            <p className="auth-register-copy">
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account? <Link to="/register">Register</Link>.
                </>
              ) : (
                <>
                  Already have an account? <Link to="/login">Sign in</Link>.
                </>
              )}
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
