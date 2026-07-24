import {
  PLAN_DISPLAY_NAMES,
  PLAN_LIMITS,
  PLAN_PRICES_PAISE,
  type PaidPlan,
  type PlanTier,
} from '@cosmo/shared';
import { PlanConfigModel, type IPlanConfig } from './subscription.model';

type CachedPlan = {
  tier: PlanTier;
  name: string;
  description: string;
  amountPaise: number;
  limits: {
    monthlyApplies: number;
    monthlyScans: number;
    appliesPerHour: number;
    appliesPerDay: number;
  };
  razorpayPlanId: string | null;
  active: boolean;
};

let cache: Map<PlanTier, CachedPlan> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 60_000;

const DEFAULT_DESCRIPTIONS: Record<PlanTier, string> = {
  free: 'Starter access with limited automated applies',
  pro: 'Higher apply volume for active job seekers',
  max: 'Highest monthly volume and scan capacity',
};

function toCached(doc: IPlanConfig): CachedPlan {
  return {
    tier: doc.tier,
    name: doc.name,
    description: doc.description,
    amountPaise: doc.amountPaise,
    limits: {
      monthlyApplies: doc.limits.monthlyApplies,
      monthlyScans: doc.limits.monthlyScans,
      appliesPerHour: doc.limits.appliesPerHour,
      appliesPerDay: doc.limits.appliesPerDay,
    },
    razorpayPlanId: doc.razorpayPlanId ?? null,
    active: doc.active,
  };
}

export async function seedPlanConfigs(): Promise<void> {
  const tiers: PlanTier[] = ['free', 'pro', 'max'];
  for (const tier of tiers) {
    const existing = await PlanConfigModel.findOne({ tier });
    if (existing) continue;
    await PlanConfigModel.create({
      tier,
      name: PLAN_DISPLAY_NAMES[tier],
      description: DEFAULT_DESCRIPTIONS[tier],
      amountPaise: tier === 'free' ? 0 : PLAN_PRICES_PAISE[tier as PaidPlan],
      limits: { ...PLAN_LIMITS[tier] },
      razorpayPlanId: null,
      active: true,
    });
  }
  invalidatePlanCache();
}

export function invalidatePlanCache(): void {
  cache = null;
  cacheAt = 0;
}

async function loadCache(): Promise<Map<PlanTier, CachedPlan>> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  await seedPlanConfigs();
  const docs = await PlanConfigModel.find().lean();
  const next = new Map<PlanTier, CachedPlan>();
  for (const doc of docs) {
    next.set(doc.tier, {
      tier: doc.tier,
      name: doc.name,
      description: doc.description,
      amountPaise: doc.amountPaise,
      limits: {
        monthlyApplies: doc.limits.monthlyApplies,
        monthlyScans: doc.limits.monthlyScans,
        appliesPerHour: doc.limits.appliesPerHour,
        appliesPerDay: doc.limits.appliesPerDay,
      },
      razorpayPlanId: doc.razorpayPlanId ?? null,
      active: doc.active,
    });
  }

  // Fallback for any missing tiers
  for (const tier of ['free', 'pro', 'max'] as PlanTier[]) {
    if (next.has(tier)) continue;
    next.set(tier, {
      tier,
      name: PLAN_DISPLAY_NAMES[tier],
      description: DEFAULT_DESCRIPTIONS[tier],
      amountPaise: tier === 'free' ? 0 : PLAN_PRICES_PAISE[tier as PaidPlan],
      limits: { ...PLAN_LIMITS[tier] },
      razorpayPlanId: null,
      active: true,
    });
  }

  cache = next;
  cacheAt = now;
  return next;
}

export async function listPlanConfigs(): Promise<CachedPlan[]> {
  const map = await loadCache();
  return ['free', 'pro', 'max'].map((t) => map.get(t as PlanTier)!);
}

export async function getPlanConfig(tier: PlanTier): Promise<CachedPlan> {
  const map = await loadCache();
  return map.get(tier)!;
}

export async function getPaidPlanAmount(plan: PaidPlan): Promise<number> {
  const cfg = await getPlanConfig(plan);
  return cfg.amountPaise;
}

export async function getPlanLimitsFromConfig(tier: PlanTier) {
  const cfg = await getPlanConfig(tier);
  return cfg.limits;
}
