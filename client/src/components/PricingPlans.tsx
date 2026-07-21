import * as React from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles, X } from 'lucide-react';

type BillingPeriod = 'annual' | 'monthly';

type Feature = {
  label: string;
  included?: boolean;
};

type Plan = {
  name: string;
  description: string;
  annualPrice: string;
  monthlyPrice: string;
  annualNote?: string;
  features: Feature[];
  highlighted?: boolean;
};

const annualPlans: Plan[] = [
  {
    name: 'Free',
    description: 'Great for occasional applications.',
    annualPrice: '$0',
    monthlyPrice: '$0',
    annualNote: '*billed at $0 per year.',
    features: [
      { label: '20 auto-applies per month' },
      { label: 'Application tracker' },
      { label: 'AI cover letters', included: false },
    ],
  },
  {
    name: 'Pro',
    description: 'For job seekers applying every week.',
    annualPrice: '$19',
    monthlyPrice: '$24',
    annualNote: '*billed at $228 per year.',
    highlighted: true,
    features: [
      { label: 'Unlimited auto-applies' },
      { label: 'AI cover letters & answers' },
      { label: 'Priority Naukri co-pilot' },
      { label: 'Application analytics' },
    ],
  },
  {
    name: 'Pro + Coach',
    description: 'For focused searches with extra guidance.',
    annualPrice: '$39',
    monthlyPrice: '$49',
    annualNote: '*billed at $468 per year.',
    features: [
      { label: 'Everything in Pro' },
      { label: 'Resume critique credits' },
      { label: 'Interview prep prompts' },
      { label: 'Priority support' },
    ],
  },
];

const monthlyPlans: Plan[] = [
  {
    name: 'Free',
    description: 'Great for occasional applications.',
    annualPrice: '$0',
    monthlyPrice: '$0',
    features: [
      { label: '20 auto-applies per month' },
      { label: 'Application tracker' },
      { label: 'AI cover letters', included: false },
    ],
  },
  {
    name: 'Starter',
    description: 'For small but consistent searches.',
    annualPrice: '$15',
    monthlyPrice: '$15',
    features: [
      { label: '100 auto-applies per month' },
      { label: 'AI cover letters' },
      { label: 'Application analytics' },
      { label: 'Naukri co-pilot' },
    ],
  },
  {
    name: 'Pro',
    description: 'For job seekers applying every week.',
    annualPrice: '$24',
    monthlyPrice: '$24',
    highlighted: true,
    features: [
      { label: 'Unlimited auto-applies' },
      { label: 'AI cover letters & answers' },
      { label: 'Priority Naukri co-pilot' },
      { label: 'Application analytics' },
    ],
  },
  {
    name: 'Pro + Coach',
    description: 'For focused searches with extra guidance.',
    annualPrice: '$49',
    monthlyPrice: '$49',
    features: [
      { label: 'Everything in Pro' },
      { label: 'Resume critique credits' },
      { label: 'Interview prep prompts' },
      { label: 'Priority support' },
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
  const [billing, setBilling] = React.useState<BillingPeriod>('annual');
  const plans = billing === 'annual' ? annualPlans : monthlyPlans;

  return (
    <section className="pricing-page" id="pricing" aria-labelledby="pricing-heading">
      <div className="pricing-shell">
        <header className="pricing-header">
          <div className="pricing-eyebrow">
            <span className="eyebrow-dot" />
            Transparent pricing
          </div>
          <h2 id="pricing-heading">
            Plans and Pricing
          </h2>
          <p>
            Apply faster with annual plans — unlock unlimited auto-applies and
            save on your subscription.
          </p>
          <div className="billing-toggle" aria-label="Billing period">
            <button
              type="button"
              className={billing === 'annual' ? 'billing-option is-active' : 'billing-option'}
              onClick={() => setBilling('annual')}
              aria-pressed={billing === 'annual'}
            >
              <span>Bill annually</span>
              <small>Unlimited</small>
            </button>
            <button
              type="button"
              className={billing === 'monthly' ? 'billing-option is-active' : 'billing-option'}
              onClick={() => setBilling('monthly')}
              aria-pressed={billing === 'monthly'}
            >
              <span>Bill monthly</span>
            </button>
          </div>
        </header>

        <div
          className={`pricing-grid${billing === 'monthly' ? ' pricing-grid--four' : ''}`}
          aria-live="polite"
        >
          {plans.map((plan) => (
            <article
              className={plan.highlighted ? 'plan-card plan-card-highlighted' : 'plan-card'}
              key={`${billing}-${plan.name}`}
            >
              <div className="plan-card-inner">
                <div className="plan-card-top">
                  <div>
                    <h3>{plan.name}</h3>
                    <p>{plan.description}</p>
                  </div>
                  <div className="plan-price">
                    <strong>
                      {billing === 'annual' ? plan.annualPrice : plan.monthlyPrice}
                    </strong>
                    <span>
                      per month, per user.
                      {billing === 'annual' && plan.annualNote ? (
                        <>
                          <br />
                          {plan.annualNote}
                        </>
                      ) : null}
                    </span>
                  </div>
                  <Link
                    to="/register"
                    className={`pricing-action${plan.highlighted ? ' pricing-action-dark' : ''}`}
                  >
                    <span>Get started</span>
                  </Link>
                </div>
                <Divider />
                <div className="included-list">
                  <p className="included-label">What’s included:</p>
                  {plan.features.map((feature) => {
                    const included = feature.included !== false;
                    return (
                      <div
                        className={`feature-row${included ? '' : ' feature-row--excluded'}`}
                        key={feature.label}
                      >
                        {included ? (
                          <Check size={18} strokeWidth={1.8} aria-hidden="true" />
                        ) : (
                          <X size={18} strokeWidth={1.8} aria-hidden="true" />
                        )}
                        <span>{feature.label}</span>
                      </div>
                    );
                  })}
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
              <p className="team-note">Billed annually</p>
              <a
                className="pricing-action pricing-action-dark"
                href="mailto:sales@tsenta.com?subject=Tsenta%20Team%20Plan"
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
