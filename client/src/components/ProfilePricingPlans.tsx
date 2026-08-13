import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  type FREQUENCY,
  FrequencyToggle,
} from '@/components/ui/pricing-01-utils/frequency-toggle';
import { cn } from '@/lib/utils';
import type { PaidPlan, PlanTier } from '@cosmo/shared';
import NumberFlow from '@number-flow/react';
import confetti from 'canvas-confetti';
import { ArrowUpRight, Check } from 'lucide-react';
import { useState } from 'react';
import { CosmosLoader } from './CosmosLogo';

export type ProfilePlanCard = {
  tier: PlanTier;
  name: string;
  description?: string;
  amountPaise: number;
  features: string[];
};

export type CouponDiscountPreview = {
  originalAmountPaise: number;
  finalAmountPaise: number;
  label: string;
};

const BG_BY_TIER: Record<PlanTier, string> = {
  free: 'bg-blue-50',
  pro: 'bg-emerald-50',
  max: 'bg-amber-50',
};

const DESC_BY_TIER: Record<PlanTier, string> = {
  free: 'Start applying with core automation.',
  pro: 'For serious searches that need more volume.',
  max: 'Maximum applies and scans for heavy usage.',
};

function yearlyPerMonth(monthlyRupees: number): number {
  if (monthlyRupees <= 0) return 0;
  return Math.round(monthlyRupees * 0.85);
}

function paiseToRupees(paise: number): number {
  return Math.round(paise / 100);
}

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
}

type ProfilePricingPlansProps = {
  currentPlan: PlanTier;
  planCards: ProfilePlanCard[];
  couponCode: string;
  couponHint: string | null;
  couponError: string | null;
  couponBusy: boolean;
  couponDiscounts: Partial<Record<PaidPlan, CouponDiscountPreview>>;
  busyPlan: PaidPlan | null;
  onCouponChange: (code: string) => void;
  onApplyCoupon: () => void;
  onUpgrade: (plan: PaidPlan) => void;
};

export function ProfilePricingPlans({
  currentPlan,
  planCards,
  couponCode,
  couponHint,
  couponError,
  couponBusy,
  couponDiscounts,
  busyPlan,
  onCouponChange,
  onApplyCoupon,
  onUpgrade,
}: ProfilePricingPlansProps) {
  const [frequency, setFrequency] = useState<FREQUENCY>('monthly');

  function onFrequencyChange(next: FREQUENCY) {
    setFrequency(next);
    if (next === 'yearly') fireYearlyConfetti();
  }

  const ordered = (['free', 'pro', 'max'] as PlanTier[])
    .map((tier) => planCards.find((p) => p.tier === tier))
    .filter(Boolean) as ProfilePlanCard[];

  const top = ordered.filter((p) => p.tier !== 'max');
  const bottom = ordered.find((p) => p.tier === 'max');

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <FrequencyToggle
          frequency={frequency}
          setFrequency={onFrequencyChange}
        />

        <div className="flex w-full max-w-md flex-col gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="plan-coupon">
            Coupon code
          </label>
          <div className="flex gap-2">
            <input
              id="plan-coupon"
              value={couponCode}
              onChange={(e) => onCouponChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onApplyCoupon();
                }
              }}
              placeholder="Optional — e.g. INDY40"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-black/25 focus:ring-2 focus:ring-black/5"
            />
            <Button
              type="button"
              disabled={couponBusy || !couponCode.trim()}
              onClick={onApplyCoupon}
              className="h-auto shrink-0 rounded-xl bg-black px-4 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
            >
              {couponBusy ? (
                <CosmosLoader
                  label=""
                  size={16}
                  className="cosmos-loader--inline"
                />
              ) : (
                'Apply'
              )}
            </Button>
          </div>
          {couponError ? (
            <p className="text-sm text-red-600" role="alert">
              {couponError}
            </p>
          ) : couponHint ? (
            <p className="text-sm text-[#1b5e3b]" role="status">
              Applied — {couponHint}. Prices updated below.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Press Enter or Apply to preview the discount on Pro / Max.
            </p>
          )}
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        {top.map((card) => (
          <PlanCard
            key={card.tier}
            card={card}
            frequency={frequency}
            currentPlan={currentPlan}
            busyPlan={busyPlan}
            discount={
              card.tier === 'free'
                ? undefined
                : couponDiscounts[card.tier as PaidPlan]
            }
            onUpgrade={onUpgrade}
          />
        ))}
        {bottom ? (
          <PlanCard
            key={bottom.tier}
            card={bottom}
            frequency={frequency}
            currentPlan={currentPlan}
            busyPlan={busyPlan}
            discount={couponDiscounts.max}
            onUpgrade={onUpgrade}
            className="lg:col-span-2 lg:mx-auto lg:max-w-[calc(50%-0.625rem)]"
          />
        ) : null}
      </div>
    </div>
  );
}

function PlanCard({
  card,
  frequency,
  currentPlan,
  busyPlan,
  discount,
  onUpgrade,
  className,
}: {
  card: ProfilePlanCard;
  frequency: FREQUENCY;
  currentPlan: PlanTier;
  busyPlan: PaidPlan | null;
  discount?: CouponDiscountPreview;
  onUpgrade: (plan: PaidPlan) => void;
  className?: string;
}) {
  const catalogMonthly = paiseToRupees(card.amountPaise);
  const discountedMonthly = discount
    ? paiseToRupees(discount.finalAmountPaise)
    : null;
  const baseMonthly = discountedMonthly ?? catalogMonthly;
  const price =
    frequency === 'yearly' ? yearlyPerMonth(baseMonthly) : baseMonthly;
  const strikeMonthly =
    discount && discount.finalAmountPaise < discount.originalAmountPaise
      ? paiseToRupees(discount.originalAmountPaise)
      : null;
  const isCurrent = currentPlan === card.tier;
  const canUpgrade =
    (card.tier === 'pro' && currentPlan === 'free') ||
    (card.tier === 'max' && currentPlan !== 'max');
  const showYearlySave =
    !discount &&
    frequency === 'yearly' &&
    catalogMonthly > 0 &&
    yearlyPerMonth(catalogMonthly) < catalogMonthly;

  return (
    <div className={cn('w-full', className)}>
      <Card
        className={cn(
          BG_BY_TIER[card.tier],
          'relative h-full w-full rounded-[1.75rem] border-0 p-5 text-foreground shadow-none ring-0 sm:p-7',
          isCurrent && 'ring-2 ring-black/80',
        )}
      >
        {isCurrent ? (
          <span className="absolute top-4 right-4 rounded-full bg-black px-2.5 py-1 text-xs font-semibold text-white">
            Current
          </span>
        ) : discount ? (
          <span className="absolute top-4 right-4 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            {discount.label}
          </span>
        ) : showYearlySave ? (
          <span className="absolute top-4 right-4 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            15% off
          </span>
        ) : null}

        <CardContent className="flex h-full w-full flex-col items-start gap-5 self-stretch p-0 sm:flex-row sm:gap-7">
          <div className="flex flex-col items-start gap-4 self-stretch sm:w-[42%] sm:min-w-[11rem]">
            <div className="flex flex-col gap-2.5">
              <Badge className="h-8 w-fit rounded-full border-0 bg-black px-3.5 py-1 text-base font-medium leading-5 text-white hover:bg-black">
                {card.name}
              </Badge>
              <p className="max-w-64 text-base font-normal leading-relaxed text-muted-foreground">
                {card.description || DESC_BY_TIER[card.tier]}
              </p>
            </div>

            <div className="flex flex-col gap-3.5">
              <div>
                {strikeMonthly != null && strikeMonthly > price ? (
                  <p className="mb-0.5 text-base text-muted-foreground line-through">
                    ₹{frequency === 'yearly' ? yearlyPerMonth(strikeMonthly) : strikeMonthly}
                    /month
                  </p>
                ) : null}
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
                    {discount
                      ? `Coupon applied · billed monthly at checkout`
                      : frequency === 'yearly'
                        ? `≈ ₹${price * 12}/year · display only`
                        : 'billed monthly'}
                  </p>
                ) : null}
              </div>

              {isCurrent ? (
                <span className="inline-flex h-12 items-center rounded-full border border-black/10 bg-white px-5 text-base font-medium text-muted-foreground">
                  Current plan
                </span>
              ) : canUpgrade ? (
                <Button
                  type="button"
                  disabled={busyPlan !== null}
                  onClick={() => onUpgrade(card.tier as PaidPlan)}
                  className="inline-flex h-12 w-full max-w-[16rem] items-center justify-center gap-2 rounded-full border-0 bg-black px-5 text-base font-medium text-white no-underline shadow-none hover:bg-black/90 hover:text-white disabled:opacity-60"
                >
                  {busyPlan === card.tier ? (
                    <CosmosLoader
                      label=""
                      size={18}
                      className="cosmos-loader--inline"
                    />
                  ) : (
                    <>
                      Upgrade to {card.name}
                      <ArrowUpRight size={17} aria-hidden />
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex grow flex-col items-start gap-3 self-stretch sm:border-l sm:border-black/10 sm:pl-7">
            <p className="text-base font-medium text-foreground sm:text-lg">
              Features
            </p>
            <ul className="flex flex-col items-start gap-2.5 self-stretch">
              {card.features.map((feature) => (
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
    </div>
  );
}
