import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import type { PaidPlan } from '@atlas/shared';
import { useAuthStore } from '../store/authStore';
import {
  downloadPaymentInvoice,
  previewPaymentInvoice,
  startPlanCheckout,
} from '../lib/razorpayCheckout';
import { CosmosLoader } from './CosmosLogo';

type Feature = {
  label: string;
};

type Plan = {
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

const plans: Plan[] = [
  {
    name: 'Free',
    description: 'Start applying with core automation.',
    price: '₹0',
    priceNote: '/ forever',
    cta: 'Get started',
    features: [
      { label: '50 Automated Applies' },
      { label: '500 Multi-board Scans' },
    ],
  },
  {
    name: 'Pro',
    description: 'For serious searches that need more volume.',
    price: '₹99',
    priceNote: '/ month',
    strikePrice: '₹299/month',
    lockNote: 'Price locks forever when you upgrade',
    cta: 'Upgrade to Pro',
    highlighted: true,
    badge: 'Most popular',
    paidPlan: 'pro',
    features: [
      { label: '300 Automated Applies' },
      { label: '1500 Multi-board Scans' },
      { label: 'Priority Bot Processing Queue' },
      { label: 'Advanced ATS Keyword Injection' },
      { label: 'Dedicated IP Routing' },
    ],
  },
  {
    name: 'Max',
    description: 'Maximum applies and scans for heavy usage.',
    price: '₹299',
    priceNote: '/ month',
    strikePrice: '₹799/month',
    lockNote: 'Price locks forever when you upgrade',
    cta: 'Upgrade to Max',
    paidPlan: 'max',
    features: [
      { label: '1000 Automated Applies' },
      { label: '5000 Multi-board Scans' },
      { label: 'Priority Bot Processing Queue' },
      { label: 'Advanced ATS Keyword Injection' },
      { label: 'Dedicated IP Routing' },
    ],
  },
];

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

  async function handleUpgrade(plan: PaidPlan) {
    if (!accessToken) {
      navigate(`/login?next=${encodeURIComponent('/#pricing')}`);
      return;
    }

    setBusyPlan(plan);
    setStatus(null);
    setLastPaymentId(null);
    try {
      const result = await startPlanCheckout(plan);
      setLastPaymentId(result.paymentId);
      setStatus(
        `Payment successful — ${plan === 'pro' ? 'Pro' : 'Max'} is active until ${new Date(result.planExpiresAt).toLocaleDateString('en-IN')}. Invoice ${result.invoiceNumber} is ready.`
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

        <div className="pricing-grid" aria-live="polite">
          {plans.map((plan) => (
            <article
              className={plan.highlighted ? 'plan-card plan-card-highlighted' : 'plan-card'}
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
                      <span className="plan-price-strike">{plan.strikePrice}</span>
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
                    <button
                      type="button"
                      className={`pricing-action${plan.highlighted ? ' pricing-action-dark' : ''}`}
                      disabled={busyPlan !== null}
                      onClick={() => void handleUpgrade(plan.paidPlan!)}
                    >
                      {busyPlan === plan.paidPlan ? (
                        <CosmosLoader
                          label=""
                          size={20}
                          className="cosmos-loader--inline"
                        />
                      ) : (
                        <span>{plan.cta}</span>
                      )}
                    </button>
                  ) : (
                    <Link
                      to="/register"
                      className={`pricing-action${plan.highlighted ? ' pricing-action-dark' : ''}`}
                    >
                      <span>{plan.cta}</span>
                    </Link>
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

        <div className="pricing-compatible" aria-label="Compatible platforms">
          <p>Compatible with</p>
          <div className="pricing-compatible__logos">
            <span className="pricing-compatible__chip">Naukri</span>
            <span className="pricing-compatible__chip">Chrome</span>
            <span className="pricing-compatible__chip">LinkedIn</span>
          </div>
        </div>

        <section className="team-plan" aria-labelledby="team-heading">
          <div className="team-hero">
            <div className="team-copy">
              <p className="team-kicker">For ambitious teams</p>
              <h3 id="team-heading">Team Plan</h3>
              <div className="team-price">Custom pricing</div>
              <p className="team-note">Talk to us for seats and volume</p>
              <a
                className="pricing-action pricing-action-dark"
                href="mailto:sales@cosmovai.com?subject=Cosmo%20Team%20Plan"
              >
                <span>Contact sales</span>
              </a>
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
