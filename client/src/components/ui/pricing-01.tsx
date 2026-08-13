import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type FREQUENCY,
  FrequencyToggle,
} from '@/components/ui/pricing-01-utils/frequency-toggle';
import { cn } from '@/lib/utils';
import { fetchPublicPlans } from '@/lib/api';
import {
  DEFAULT_PLAN_FEATURES,
  PLAN_PRICES_PAISE,
  yearlyPerMonthRupees,
  type PaidPlan,
} from '@cosmo/shared';
import NumberFlow from '@number-flow/react';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowUpRight, Check } from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import React from 'react';
import { Link } from 'react-router-dom';

type PricingPlan = {
  plan_bg_color: string;
  plan_name: string;
  plan_descp: string;
  plan_price: {
    monthly: number;
    yearly: number; // display rate per month when billed yearly
  };
  plan_feature: string[];
  plan_cta: string;
  plan_href: string;
  tier: 'free' | PaidPlan;
};

/** ~15% off vs paying monthly × 12. */
function yearlyPerMonth(monthlyRupees: number): number {
  return yearlyPerMonthRupees(monthlyRupees);
}

function paiseToRupees(paise: number): number {
  return Math.round(paise / 100);
}

const FALLBACK_PLANS: PricingPlan[] = [
  {
    tier: 'free',
    plan_bg_color: 'bg-blue-50',
    plan_name: 'Free',
    plan_descp: 'Start applying with core automation.',
    plan_price: { monthly: 0, yearly: 0 },
    plan_feature: DEFAULT_PLAN_FEATURES.free,
    plan_cta: 'Get started',
    plan_href: '/register',
  },
  {
    tier: 'pro',
    plan_bg_color: 'bg-emerald-50',
    plan_name: 'Pro',
    plan_descp: 'For serious searches that need more volume.',
    plan_price: {
      monthly: paiseToRupees(PLAN_PRICES_PAISE.pro),
      yearly: yearlyPerMonth(paiseToRupees(PLAN_PRICES_PAISE.pro)),
    },
    plan_feature: DEFAULT_PLAN_FEATURES.pro,
    plan_cta: 'Upgrade to Pro',
    plan_href: `/login?next=${encodeURIComponent('/profile#plans')}`,
  },
  {
    tier: 'max',
    plan_bg_color: 'bg-amber-50',
    plan_name: 'Max',
    plan_descp: 'Maximum applies and scans for heavy usage.',
    plan_price: {
      monthly: paiseToRupees(PLAN_PRICES_PAISE.max),
      yearly: yearlyPerMonth(paiseToRupees(PLAN_PRICES_PAISE.max)),
    },
    plan_feature: DEFAULT_PLAN_FEATURES.max,
    plan_cta: 'Upgrade to Max',
    plan_href: `/login?next=${encodeURIComponent('/profile#plans')}`,
  },
];

const BG_BY_TIER: Record<PricingPlan['tier'], string> = {
  free: 'bg-blue-50',
  pro: 'bg-emerald-50',
  max: 'bg-amber-50',
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 80 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: index * 0.2,
      duration: 0.6,
      ease: 'easeInOut',
    },
  }),
};

function plansCheckoutPath(frequency: FREQUENCY): string {
  const billing = frequency === 'yearly' ? 'yearly' : 'monthly';
  return `/profile?billing=${billing}#plans`;
}

function plansUpgradeHref(frequency: FREQUENCY): string {
  return `/login?next=${encodeURIComponent(plansCheckoutPath(frequency))}`;
}

function PricingCard({
  plan,
  index,
  frequency,
  className,
}: {
  plan: PricingPlan;
  index: number;
  frequency: FREQUENCY;
  className?: string;
}) {
  const price = plan.plan_price[frequency];
  const showYearlySave =
    frequency === 'yearly' && plan.plan_price.monthly > plan.plan_price.yearly;
  const ctaHref =
    plan.tier === 'free' ? plan.plan_href : plansUpgradeHref(frequency);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      custom={index}
      className={cn('w-full', className)}
    >
      <Card
        className={cn(
          plan.plan_bg_color,
          'relative h-full w-full rounded-[1.75rem] border-0 p-5 text-foreground shadow-none ring-0 sm:p-7',
        )}
      >
        {showYearlySave ? (
          <span className="absolute top-4 right-4 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {Math.round(
              ((plan.plan_price.monthly - plan.plan_price.yearly) /
                plan.plan_price.monthly) *
                100,
            )}
            % off
          </span>
        ) : null}
        <CardContent className="flex h-full w-full flex-col items-start gap-5 self-stretch p-0 sm:flex-row sm:gap-7">
          <div className="flex flex-col items-start gap-4 self-stretch sm:w-[42%] sm:min-w-[11rem]">
            <div className="flex flex-col gap-2.5">
              <Badge className="h-8 w-fit rounded-full border-0 bg-black px-3.5 py-1 text-base font-medium leading-5 text-white hover:bg-black">
                {plan.plan_name}
              </Badge>
              <p className="max-w-64 text-base font-normal leading-relaxed text-muted-foreground">
                {plan.plan_descp}
              </p>
            </div>
            <div className="flex flex-col gap-3.5">
              <div>
                <p className="flex items-end text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  {price === 0 ? (
                    <>
                      ₹0
                      <span className="pb-1 text-base font-normal text-muted-foreground">
                        /forever
                      </span>
                    </>
                  ) : (
                    <>
                      <NumberFlow
                        value={price}
                        prefix="₹"
                        className="font-semibold tracking-tight"
                        transformTiming={{
                          duration: 450,
                          easing: 'ease-out',
                        }}
                      />
                      <span className="pb-1 text-base font-normal text-muted-foreground">
                        /month
                      </span>
                    </>
                  )}
                </p>
                {price > 0 ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {frequency === 'yearly'
                      ? `₹${price * 12}/year · billed yearly at checkout`
                      : 'billed monthly'}
                  </p>
                ) : null}
              </div>
              <Button
                asChild
                className="group relative h-12 w-full max-w-[15rem] cursor-pointer overflow-hidden rounded-full border border-black/5 bg-white p-1 pe-12 ps-5 text-base font-medium text-black no-underline shadow-sm transition-all duration-500 hover:bg-white hover:pe-5 hover:ps-12 hover:text-black hover:no-underline"
              >
                <Link to={ctaHref}>
                  <span className="relative z-10 transition-all duration-500">
                    {plan.plan_cta}
                  </span>
                  <div className="absolute right-1 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white transition-all duration-500 group-hover:right-[calc(100%-44px)] group-hover:rotate-45">
                    <ArrowUpRight size={16} aria-hidden />
                  </div>
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex grow flex-col items-start gap-3 self-stretch sm:border-l sm:border-black/10 sm:pl-7">
            <p className="text-base font-medium text-foreground sm:text-lg">
              Features
            </p>
            <ul className="flex flex-col items-start gap-2.5 self-stretch">
              {plan.plan_feature.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2.5 text-base font-normal leading-snug tracking-normal text-foreground"
                >
                  <Check
                    size={17}
                    className="shrink-0 text-foreground"
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Pricing() {
  const [frequency, setFrequency] = React.useState<FREQUENCY>('monthly');

  function fireYearlyConfetti() {
    const colors = ['#15362b', '#0c3d32', '#f59e0b', '#ffffff', '#34d399'];
    confetti({
      particleCount: 70,
      spread: 62,
      startVelocity: 28,
      origin: { y: 0.35 },
      colors,
      disableForReducedMotion: true,
    });
    window.setTimeout(() => {
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 48,
        origin: { x: 0.15, y: 0.4 },
        colors,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 48,
        origin: { x: 0.85, y: 0.4 },
        colors,
        disableForReducedMotion: true,
      });
    }, 120);
  }

  function onFrequencyChange(next: FREQUENCY) {
    setFrequency(next);
    if (next === 'yearly') fireYearlyConfetti();
  }

  const { data: catalog } = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => {
      const res = await fetchPublicPlans();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
    staleTime: 60_000,
  });

  const plans = React.useMemo(() => {
    if (!catalog?.length) return FALLBACK_PLANS;

    return FALLBACK_PLANS.map((fallback) => {
      const api = catalog.find((p) => p.tier === fallback.tier);
      if (!api) return fallback;
      const monthly = paiseToRupees(api.amountPaise);
      const isFree = fallback.tier === 'free';
      return {
        ...fallback,
        plan_bg_color: BG_BY_TIER[fallback.tier],
        plan_name: api.name || fallback.plan_name,
        plan_descp: api.description || fallback.plan_descp,
        plan_price: {
          monthly,
          yearly: yearlyPerMonth(monthly),
        },
        plan_feature:
          api.features?.length > 0 ? api.features : fallback.plan_feature,
        plan_cta: isFree
          ? 'Get started'
          : `Upgrade to ${api.name || fallback.plan_name}`,
        plan_href: isFree
          ? '/register'
          : `/login?next=${encodeURIComponent('/profile#plans')}`,
      } satisfies PricingPlan;
    });
  }, [catalog]);

  const topPlans = plans.filter((p) => p.tier !== 'max');
  const bottomPlan = plans.find((p) => p.tier === 'max') ?? FALLBACK_PLANS[2];

  return (
    <section
      className="bg-white py-10"
      id="pricing"
      aria-labelledby="pricing-heading"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:py-16 lg:px-8 lg:py-20 xl:px-16">
        <div className="flex w-full flex-col items-center justify-center gap-8 md:gap-12">
          <motion.div
            className="flex flex-col items-center justify-center gap-4"
            initial={{ opacity: 0, y: -24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            <Badge
              variant="outline"
              className="h-8 w-fit rounded-full border-black/15 bg-transparent px-3.5 py-1 text-base font-normal leading-5 text-foreground"
            >
              Pricing
            </Badge>
            <div className="mx-auto max-w-sm text-center sm:max-w-2xl">
              <h2
                id="pricing-heading"
                className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl"
              >
                Pick the plan that fits your job search
              </h2>
            </div>
            <FrequencyToggle
              frequency={frequency}
              setFrequency={onFrequencyChange}
            />
          </motion.div>

          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            {topPlans.map((plan, index) => (
              <PricingCard
                key={plan.plan_name}
                plan={plan}
                index={index}
                frequency={frequency}
              />
            ))}

            <PricingCard
              plan={bottomPlan}
              index={2}
              frequency={frequency}
              className="lg:col-span-2 lg:mx-auto lg:max-w-[calc(50%-0.75rem)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
