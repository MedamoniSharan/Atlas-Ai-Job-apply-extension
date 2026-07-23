import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { loginWithGoogle } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader, CosmosMark } from '../components/CosmosLogo';
import Lightfall from '../components/Lightfall';
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

const AUTH_LIGHTFALL_COLORS = ['#A6C8FF', '#5227FF', '#FF9FFC'];

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
            <CosmosMark logoSize={44} />
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function finishAuth(isNewAccount: boolean) {
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/')) {
      const [pathname, hash] = next.split('#');
      navigate({
        pathname: pathname || '/',
        hash: hash || undefined,
      });
      return;
    }
    navigate(isNewAccount ? '/get-extension' : '/dashboard');
  }

  const googleLogin = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async ({ code }) => {
      setError('');
      setLoading(true);
      try {
        const result = await loginWithGoogle(code);
        if (!result.success) {
          setError(result.message);
          return;
        }
        setSession(result.data);
        finishAuth(mode === 'register');
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google sign-in was cancelled or failed. Please try again.');
    },
  });

  return (
    <div className="auth-shell">
      <AuthPromoPanel />

      <main className="auth-form-shell">
        <div className="auth-form-shell__lightfall" aria-hidden="true">
          <Lightfall
            colors={AUTH_LIGHTFALL_COLORS}
            backgroundColor="#0A29FF"
            speed={1}
            streakCount={3}
            streakWidth={1}
            streakLength={1}
            glow={1}
            density={0.45}
            twinkle={1}
            zoom={2}
            backgroundGlow={1}
            opacity={1}
            mouseInteraction
            mouseStrength={1}
            mouseRadius={0.6}
          />
        </div>

        <section className="auth-form-panel" aria-labelledby="auth-form-title">
          <div className="auth-form-panel__mobile-brand" aria-label="Cosmo home">
            <Link to="/" className="auth-brand">
              <CosmosMark logoSize={36} />
            </Link>
          </div>

          <h1 id="auth-form-title">
            {mode === 'login' ? 'Sign in to Cosmo' : 'Create your Cosmo account'}
          </h1>
          <p className="auth-form-panel__tagline">Apply to jobs in 1-click.</p>
          <p className="auth-form-panel__description">
            Power your entire job search, with our recruiter-approved AI.
          </p>

          <div className="auth-social-stack" aria-label="Sign in options">
            <button
              type="button"
              className="auth-social-button"
              aria-label="Continue with Google"
              disabled={loading || !import.meta.env.VITE_GOOGLE_CLIENT_ID}
              onClick={() => {
                if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
                  setError('Google sign-in is not configured.');
                  return;
                }
                googleLogin();
              }}
            >
              {loading ? (
                <CosmosLoader label="" size={22} className="auth-submit-loader" />
              ) : (
                <GoogleMark />
              )}
              <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
            </button>
          </div>

          {error ? (
            <p className="error auth-status-message" role="alert">
              {error}
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
        </section>
      </main>
    </div>
  );
}
