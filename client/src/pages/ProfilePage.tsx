import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import type { PaidPlan, PlanTier } from '@atlas/shared';
import { fetchBillingMe } from '../lib/api';
import { startPlanCheckout } from '../lib/razorpayCheckout';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader } from '../components/CosmosLogo';

const PLAN_LABEL: Record<PlanTier, string> = {
  free: 'Basic',
  pro: 'Premium',
  max: 'UltraMag',
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: ['50 automated applies / month', '500 multi-board scans / month'],
  pro: [
    '300 automated applies / month',
    '1500 multi-board scans / month',
    'Priority bot processing',
  ],
  max: [
    '1000 automated applies / month',
    '5000 multi-board scans / month',
    'Priority bot processing',
    'Highest monthly volume',
  ],
};

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['billing', 'me'],
    queryFn: async () => {
      const res = await fetchBillingMe();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  async function upgrade(plan: PaidPlan) {
    setBusyPlan(plan);
    setStatus(null);
    try {
      const result = await startPlanCheckout(plan);
      setStatus(
        `${plan === 'pro' ? 'Premium' : 'UltraMag'} is active until ${new Date(result.planExpiresAt).toLocaleDateString('en-IN')}.`
      );
      await queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout failed';
      if (message !== 'Payment cancelled') setStatus(message);
    } finally {
      setBusyPlan(null);
    }
  }

  if (isLoading) {
    return (
      <div className="dash">
        <CosmosLoader label="Loading profile…" className="cosmos-loader--inline" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="dash">
        <div className="panel">
          <p className="muted">Couldn’t load plan details. Try again shortly.</p>
        </div>
      </div>
    );
  }

  const plan = data.plan;
  const planLabel = PLAN_LABEL[plan];

  return (
    <div className="dash">
      <div className="panel profile-card">
        <div className="profile-card__identity">
          <div className="profile-card__avatar" aria-hidden>
            {(user?.name ?? 'U')
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || 'U'}
          </div>
          <div>
            <h2 className="profile-card__name">{user?.name || 'Account'}</h2>
            <p className="muted">{user?.email}</p>
            <span className={`profile-card__plan profile-card__plan--${plan}`}>
              {planLabel}
            </span>
          </div>
        </div>

        <p className="muted profile-card__copy">
          Job preferences live in Settings. Plan upgrades happen here.
        </p>
        <Link className="dash-btn dash-btn--ghost" to="/settings">
          Open Settings
        </Link>
      </div>

      <div className="panel profile-plan">
        <div className="profile-plan__head">
          <h2>Your plan</h2>
          <p className="muted">
            You’re on <strong>{planLabel}</strong>
            {data.planExpiresAt && plan !== 'free'
              ? ` · renews/expires ${new Date(data.planExpiresAt).toLocaleDateString('en-IN')}`
              : null}
            . Usage this month: {data.appliesUsed} / {data.appliesLimit} applies.
          </p>
        </div>

        {status ? (
          <p className="profile-plan__status" role="status">
            {status}
          </p>
        ) : null}

        <div className="profile-plan__grid">
          <article
            className={`profile-plan__option${plan === 'free' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>Basic</h3>
              <strong>₹0</strong>
            </div>
            <ul>
              {PLAN_FEATURES.free.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'free' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : null}
          </article>

          <article
            className={`profile-plan__option${plan === 'pro' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>
                Premium
                <Sparkles size={14} strokeWidth={2} aria-hidden />
              </h3>
              <strong>
                ₹99<span>/mo</span>
              </strong>
            </div>
            <ul>
              {PLAN_FEATURES.pro.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'pro' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : plan === 'max' ? null : (
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={busyPlan !== null}
                onClick={() => void upgrade('pro')}
              >
                {busyPlan === 'pro' ? (
                  <CosmosLoader label="" size={20} className="cosmos-loader--inline" />
                ) : (
                  'Upgrade to Premium'
                )}
              </button>
            )}
          </article>

          <article
            className={`profile-plan__option${plan === 'max' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>UltraMag</h3>
              <strong>
                ₹299<span>/mo</span>
              </strong>
            </div>
            <ul>
              {PLAN_FEATURES.max.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'max' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : (
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={busyPlan !== null}
                onClick={() => void upgrade('max')}
              >
                {busyPlan === 'max' ? (
                  <CosmosLoader label="" size={20} className="cosmos-loader--inline" />
                ) : (
                  'Upgrade to UltraMag'
                )}
              </button>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
