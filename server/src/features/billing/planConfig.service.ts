import {
  DEFAULT_COMPARE_AT_PAISE,
  DEFAULT_PLAN_FEATURES,
  PLAN_DISPLAY_NAMES,
  PLAN_LIMITS,
  PLAN_PRICES_PAISE,
  type PaidPlan,
  type PlanTier,
  type PublicPlan,
} from '@cosmo/shared';
import { PlanConfigModel, type IPlanConfig } from './subscription.model';

type CachedPlan = {
  tier: PlanTier;
  name: string;
  description: string;
  amountPaise: number;
  compareAtPaise: number | null;
  features: string[];
  badge: string | null;
  highlighted: boolean;
  lockNote: string | null;
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

function defaultCompareAt(tier: PlanTier): number | null {
  if (tier === 'pro' || tier === 'max') {
    return DEFAULT_COMPARE_AT_PAISE[tier];
  }
  return null;
}

function defaultMarketing(tier: PlanTier) {
  return {
    compareAtPaise: defaultCompareAt(tier),
    features: [...DEFAULT_PLAN_FEATURES[tier]],
    badge: tier === 'pro' ? 'Most popular' : null,
    highlighted: tier === 'pro',
    lockNote:
      tier === 'pro' || tier === 'max'
        ? 'Price locks forever when you upgrade'
        : null,
  };
}

function toCached(doc: IPlanConfig | CachedPlan): CachedPlan {
  const marketing = defaultMarketing(doc.tier);
  return {
    tier: doc.tier,
    name: doc.name,
    description: doc.description,
    amountPaise: doc.amountPaise,
    compareAtPaise:
      doc.compareAtPaise !== undefined
        ? doc.compareAtPaise
        : marketing.compareAtPaise,
    features:
      doc.features && doc.features.length > 0
        ? [...doc.features]
        : marketing.features,
    badge: doc.badge !== undefined ? doc.badge : marketing.badge,
    highlighted:
      doc.highlighted !== undefined ? doc.highlighted : marketing.highlighted,
    lockNote: doc.lockNote !== undefined ? doc.lockNote : marketing.lockNote,
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
    const marketing = defaultMarketing(tier);
    if (existing) {
      // Align free monthly cap with product default (50 → 30).
      let dirty = false;
      if (tier === 'free' && existing.limits?.monthlyApplies === 50) {
        existing.limits.monthlyApplies = PLAN_LIMITS.free.monthlyApplies;
        dirty = true;
      }
      if (
        existing.compareAtPaise === undefined &&
        marketing.compareAtPaise !== null
      ) {
        existing.compareAtPaise = marketing.compareAtPaise;
        dirty = true;
      }
      if (!existing.features || existing.features.length === 0) {
        existing.features = marketing.features;
        dirty = true;
      }
      if (existing.badge === undefined) {
        existing.badge = marketing.badge;
        dirty = true;
      }
      if (existing.highlighted === undefined) {
        existing.highlighted = marketing.highlighted;
        dirty = true;
      }
      if (existing.lockNote === undefined) {
        existing.lockNote = marketing.lockNote;
        dirty = true;
      }
      if (dirty) {
        await existing.save();
      }
      continue;
    }
    await PlanConfigModel.create({
      tier,
      name: PLAN_DISPLAY_NAMES[tier],
      description: DEFAULT_DESCRIPTIONS[tier],
      amountPaise: tier === 'free' ? 0 : PLAN_PRICES_PAISE[tier as PaidPlan],
      compareAtPaise: marketing.compareAtPaise,
      features: marketing.features,
      badge: marketing.badge,
      highlighted: marketing.highlighted,
      lockNote: marketing.lockNote,
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
    next.set(doc.tier, toCached(doc as unknown as IPlanConfig));
  }

  // Fallback for any missing tiers
  for (const tier of ['free', 'pro', 'max'] as PlanTier[]) {
    if (next.has(tier)) continue;
    const marketing = defaultMarketing(tier);
    next.set(tier, {
      tier,
      name: PLAN_DISPLAY_NAMES[tier],
      description: DEFAULT_DESCRIPTIONS[tier],
      amountPaise: tier === 'free' ? 0 : PLAN_PRICES_PAISE[tier as PaidPlan],
      compareAtPaise: marketing.compareAtPaise,
      features: marketing.features,
      badge: marketing.badge,
      highlighted: marketing.highlighted,
      lockNote: marketing.lockNote,
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

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const plans = await listPlanConfigs();
  return plans
    .filter((p) => p.active)
    .map((p) => ({
      tier: p.tier,
      name: p.name,
      description: p.description,
      amountPaise: p.amountPaise,
      compareAtPaise: p.compareAtPaise,
      features: p.features,
      badge: p.badge,
      highlighted: p.highlighted,
      lockNote: p.lockNote,
      limits: p.limits,
      active: p.active,
    }));
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
