import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import {
  DEFAULT_COMPARE_AT_PAISE,
  DEFAULT_PLAN_FEATURES,
  PLAN_PRICES_PAISE,
  type PaidPlan,
} from '@cosmo/shared';
import { useAuthStore } from '../store/authStore';
import {
  fetchPublicPlans,
  validateCoupon,
  type PublicPlanCard,
} from '../lib/api';
import {
  downloadPaymentInvoice,
  previewPaymentInvoice,
  startPlanCheckout,
} from '../lib/razorpayCheckout';
import { BrowserStoreButtons } from './BrowserStoreButtons';
import { CosmosLoader } from './CosmosLogo';
import { SuccessStoriesButton } from './SuccessStoriesButton';

type Feature = { label: string };

type PlanCard = {
  name: string;
  description: string;
  price: string;
  priceNote: string;
  strikePrice?: string;
  lockNote?: string;
  cta: string;
  features: Feature[];
  highlighted?: boolean;
  badge?: string;
  paidPlan?: PaidPlan;
};

function formatInr(paise: number): string {
  return `₹${Math.round(paise / 100)}`;
}

function fallbackPlans(): PlanCard[] {
  return [
    {
      name: 'Free',
      description: 'Start applying with core automation.',
      price: '₹0',
      priceNote: '/ forever',
      cta: 'Get started',
      features: DEFAULT_PLAN_FEATURES.free.map((label) => ({ label })),
    },
    {
      name: 'Pro',
      description: 'For serious searches that need more volume.',
      price: formatInr(PLAN_PRICES_PAISE.pro),
      priceNote: '/ month',
      strikePrice: `${formatInr(DEFAULT_COMPARE_AT_PAISE.pro)}/month`,
      lockNote: 'Price locks forever when you upgrade',
      cta: 'Upgrade to Pro',
      highlighted: true,
      badge: 'Popular',
      paidPlan: 'pro',
      features: DEFAULT_PLAN_FEATURES.pro.map((label) => ({ label })),
    },
    {
      name: 'Max',
      description: 'Maximum applies and scans for heavy usage.',
      price: formatInr(PLAN_PRICES_PAISE.max),
      priceNote: '/ month',
      strikePrice: `${formatInr(DEFAULT_COMPARE_AT_PAISE.max)}/month`,
      lockNote: 'Price locks forever when you upgrade',
      cta: 'Upgrade to Max',
      paidPlan: 'max',
      features: DEFAULT_PLAN_FEATURES.max.map((label) => ({ label })),
    },
  ];
}

function mapPublicPlan(p: PublicPlanCard): PlanCard {
  const isFree = p.tier === 'free';
  const compare = p.compareAtPaise ?? null;
  return {
    name: p.name,
    description: p.description,
    price: formatInr(p.amountPaise),
    priceNote: isFree ? '/ forever' : '/ month',
    strikePrice:
      !isFree && compare && compare > p.amountPaise
        ? `${formatInr(compare)}/month`
        : undefined,
    lockNote: p.lockNote || undefined,
    cta: isFree
      ? 'Get started'
      : `Upgrade to ${p.name}`,
    features: (p.features?.length
      ? p.features
      : DEFAULT_PLAN_FEATURES[p.tier]
    ).map((label) => ({ label })),
    highlighted: Boolean(p.highlighted),
    badge: p.badge || undefined,
    paidPlan: isFree ? undefined : (p.tier as PaidPlan),
  };
}

const teamFeaturesLeft = [
  '3+ seats',
  'Unlimited auto-applies',
  'Shared application tracker',
  'Team analytics',
  'AI cover letters',
  'Naukri co-pilot',
];

const teamFeaturesRight = [
  'Admin controls',
  'CSV export',
  'API access',
  'Custom onboarding',
  'Dedicated success manager',
];

function Divider() {
  return (
    <div className="pricing-divider" aria-hidden="true">
      <span />
      <Sparkles size={13} strokeWidth={1.4} />
      <span />
    </div>
  );
}

export function PricingPlans() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponHint, setCouponHint] = useState<string | null>(null);

  const { data: apiPlans, isLoading } = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => {
      const res = await fetchPublicPlans();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
    staleTime: 60_000,
  });

  const plans = useMemo(() => {
    if (!apiPlans?.length) return fallbackPlans();
    return apiPlans
      .filter((p) => p.active !== false)
      .map(mapPublicPlan);
  }, [apiPlans]);

  async function applyCouponPreview(plan: PaidPlan) {
    const code = couponCode.trim();
    if (!code || !accessToken) return;
    const res = await validateCoupon(code, plan);
    if (!res.success) {
      setCouponHint(res.message || 'Invalid coupon');
      return;
    }
    setCouponHint(res.data.label);
  }

  async function handleUpgrade(plan: PaidPlan) {
    if (!accessToken) {
      navigate(`/login?next=${encodeURIComponent('/#pricing')}`);
      return;
    }

    setBusyPlan(plan);
    setStatus(null);
    setLastPaymentId(null);
    try {
      if (couponCode.trim()) {
        await applyCouponPreview(plan);
      }
      const result = await startPlanCheckout(
        plan,
        couponCode.trim() || undefined
      );
      setLastPaymentId(result.paymentId);
      setStatus(
        `Subscription started — ${plan === 'pro' ? 'Premium' : 'UltraMag'} renews monthly. Current period until ${new Date(result.planExpiresAt).toLocaleDateString('en-IN')}. Invoice ${result.invoiceNumber} is ready.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout failed';
      if (message !== 'Payment cancelled') {
        setStatus(message);
      }
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <section className="pricing-page" id="pricing" aria-labelledby="pricing-heading">
      <div className="pricing-shell">
        <header className="pricing-header">
          <h2 id="pricing-heading">Plans and Pricing</h2>
          <p>
            Pick a plan that matches your apply volume — upgrade anytime and lock
            your price forever.
          </p>
        </header>

        <div className="pricing-coupon">
          <label>
            Coupon code
            <input
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponHint(null);
              }}
              placeholder="Optional"
              autoComplete="off"
            />
          </label>
          {couponHint ? <p className="pricing-coupon__hint">{couponHint}</p> : null}
        </div>

        {status ? (
          <div className="pricing-status" role="status">
            <p>{status}</p>
            {lastPaymentId ? (
              <div className="pricing-status__actions">
                <button
                  type="button"
                  className="pricing-action"
                  onClick={() => {
                    void previewPaymentInvoice(lastPaymentId)
                      .then((url) => {
                        window.open(url, '_blank', 'noopener,noreferrer');
                      })
                      .catch(() => {
                        setStatus(
                          'Could not preview invoice. Try again from Profile.'
                        );
                      });
                  }}
                >
                  <span>Preview invoice</span>
                </button>
                <button
                  type="button"
                  className="pricing-action pricing-action-dark"
                  onClick={() => {
                    void downloadPaymentInvoice(lastPaymentId).catch(() => {
                      setStatus(
                        'Could not download invoice. Try again from Profile.'
                      );
                    });
                  }}
                >
                  <span>Download invoice</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading && !apiPlans ? (
          <CosmosLoader label="Loading plans…" className="cosmos-loader--inline" />
        ) : (
          <div className="pricing-grid" aria-live="polite">
            {plans.map((plan) => (
              <article
                className={
                  plan.highlighted
                    ? 'plan-card plan-card-highlighted'
                    : 'plan-card'
                }
                key={plan.name}
              >
                <div className="plan-card-inner">
                  <div className="plan-card-top">
                    <div>
                      {plan.badge ? (
                        <p className="plan-badge">{plan.badge}</p>
                      ) : null}
                      <h3>{plan.name}</h3>
                      <p>{plan.description}</p>
                    </div>
                    <div className="plan-price">
                      {plan.strikePrice ? (
                        <span className="plan-price-strike">
                          {plan.strikePrice}
                        </span>
                      ) : null}
                      <strong>
                        {plan.price}
                        <span className="plan-price-unit">{plan.priceNote}</span>
                      </strong>
                      {plan.lockNote ? (
                        <span className="plan-price-lock">{plan.lockNote}</span>
                      ) : null}
                    </div>
                    {plan.paidPlan ? (
                      <SuccessStoriesButton
                        label={plan.cta}
                        variant="black"
                        showArrow={false}
                        disabled={busyPlan !== null}
                        onClick={() => void handleUpgrade(plan.paidPlan!)}
                      >
                        {busyPlan === plan.paidPlan ? (
                          <span className="success-stories-button__busy">
                            <CosmosLoader
                              label=""
                              size={20}
                              className="cosmos-loader--inline"
                            />
                          </span>
                        ) : undefined}
                      </SuccessStoriesButton>
                    ) : (
                      <SuccessStoriesButton
                        label={plan.cta}
                        variant="black"
                        showArrow={false}
                        to="/register"
                      />
                    )}
                  </div>
                  <Divider />
                  <div className="included-list">
                    <p className="included-label">What’s included:</p>
                    {plan.features.map((feature) => (
                      <div className="feature-row" key={feature.label}>
                        <Check size={18} strokeWidth={1.8} aria-hidden="true" />
                        <span>{feature.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="pricing-compatible" aria-label="Available on">
          <p>Available on</p>
          <BrowserStoreButtons />
        </div>

        <section className="team-plan" aria-labelledby="team-heading">
          <div className="team-hero">
            <div className="team-copy">
              <p className="team-kicker">For ambitious teams</p>
              <h3 id="team-heading">Team Plan</h3>
              <div className="team-price">Custom pricing</div>
              <p className="team-note">Talk to us for seats and volume</p>
              <SuccessStoriesButton
                label="Contact sales"
                variant="white"
                showArrow={false}
                onClick={() => {
                  window.location.href =
                    'mailto:sales@cosmovai.com?subject=Cosmo%20Team%20Plan';
                }}
              />
            </div>
          </div>
          <div className="team-details">
            <div className="team-feature-column">
              {teamFeaturesLeft.map((feature) => (
                <div className="feature-row" key={feature}>
                  <Check size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            <div className="team-feature-column">
              {teamFeaturesRight.map((feature) => (
                <div className="feature-row" key={feature}>
                  <Check size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
