import { z } from 'zod';
import { paidPlanSchema, planTierSchema } from './models';

export const planLimitsSchema = z.object({
  monthlyApplies: z.number().int().min(0),
  monthlyScans: z.number().int().min(0),
  appliesPerHour: z.number().int().min(0),
  appliesPerDay: z.number().int().min(0),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const publicPlanSchema = z.object({
  tier: planTierSchema,
  name: z.string(),
  description: z.string(),
  amountPaise: z.number().int().min(0),
  compareAtPaise: z.number().int().min(0).nullable().optional(),
  features: z.array(z.string()).default([]),
  badge: z.string().nullable().optional(),
  highlighted: z.boolean().optional(),
  lockNote: z.string().nullable().optional(),
  limits: planLimitsSchema,
  active: z.boolean(),
});

export type PublicPlan = z.infer<typeof publicPlanSchema>;

export const DEFAULT_PLAN_FEATURES: Record<
  z.infer<typeof planTierSchema>,
  string[]
> = {
  free: [
    '30 assisted applies / month',
    'Safety: 15/day',
    '500 multi-board scans',
  ],
  pro: [
    '300 assisted applies / month',
    'Safety: 40/day',
    '1500 multi-board scans',
    'Human-paced co-pilot sessions',
  ],
  max: [
    '1000 assisted applies / month',
    'Safety: 60/day',
    '5000 multi-board scans',
    'Human-paced co-pilot sessions',
  ],
};

export const DEFAULT_COMPARE_AT_PAISE: Record<'pro' | 'max', number> = {
  pro: 29900,
  max: 79900,
};

/** https URL or data:image… for uploaded banner art. */
const offerImageUrlSchema = z
  .string()
  .max(350_000)
  .nullable()
  .optional()
  .refine(
    (v) =>
      v == null ||
      v === '' ||
      /^https?:\/\//i.test(v) ||
      /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
    { message: 'imageUrl must be an http(s) or data:image URL' }
  );

export const siteOfferSchema = z.object({
  offerId: z.string(),
  message: z.string().min(1).max(280),
  couponCode: z.string().max(40).nullable().optional(),
  linkUrl: z.string().url().nullable().optional(),
  /** Custom ticker mark (drag-drop). Falls back to default bird when empty. */
  imageUrl: offerImageUrlSchema,
  /** Show the freedom-bird / custom image mark in the site banner. */
  showBird: z.boolean().default(true),
  /** Show one Indian flag in the site banner. */
  showFlag: z.boolean().default(true),
  active: z.boolean(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  priority: z.number().int().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type SiteOffer = z.infer<typeof siteOfferSchema>;

export const adminCreateSiteOfferSchema = z.object({
  message: z.string().min(1).max(280),
  couponCode: z.string().max(40).optional().nullable(),
  linkUrl: z
    .union([z.string().url(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  imageUrl: offerImageUrlSchema.transform((v) =>
    v === '' || v === undefined ? null : v
  ),
  showBird: z.boolean().default(true),
  showFlag: z.boolean().default(true),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  priority: z.number().int().default(0),
});

export type AdminCreateSiteOfferInput = z.infer<
  typeof adminCreateSiteOfferSchema
>;

export const adminUpdateSiteOfferSchema = adminCreateSiteOfferSchema.partial();

export type AdminUpdateSiteOfferInput = z.infer<
  typeof adminUpdateSiteOfferSchema
>;

/** http(s) URL or site-relative path like /#pricing */
const bannerLinkUrlSchema = z
  .union([
    z.string().url(),
    z.string().regex(/^\/[\w#?&=./%-]*$/, 'Must be a URL or path starting with /'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v));

/** Landing hero carousel slide (Admin → Banners). */
export const siteBannerSchema = z.object({
  bannerId: z.string(),
  imageUrl: z
    .string()
    .min(1)
    .max(350_000)
    .refine(
      (v) =>
        /^https?:\/\//i.test(v) ||
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      { message: 'imageUrl must be an http(s) or data:image URL' }
    ),
  linkUrl: z
    .string()
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null ||
        v === '' ||
        /^https?:\/\//i.test(v) ||
        /^\//.test(v),
      { message: 'linkUrl must be http(s) or a path starting with /' }
    ),
  altText: z.string().max(160).nullable().optional(),
  active: z.boolean(),
  priority: z.number().int().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type SiteBanner = z.infer<typeof siteBannerSchema>;

export const adminCreateSiteBannerSchema = z.object({
  imageUrl: z
    .string()
    .min(1)
    .max(350_000)
    .refine(
      (v) =>
        /^https?:\/\//i.test(v) ||
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      { message: 'imageUrl must be an http(s) or data:image URL' }
    ),
  linkUrl: bannerLinkUrlSchema,
  altText: z.string().max(160).optional().nullable(),
  active: z.boolean().default(true),
  priority: z.number().int().default(0),
});

export type AdminCreateSiteBannerInput = z.infer<
  typeof adminCreateSiteBannerSchema
>;

export const adminUpdateSiteBannerSchema = adminCreateSiteBannerSchema.partial();

export type AdminUpdateSiteBannerInput = z.infer<
  typeof adminUpdateSiteBannerSchema
>;

export const couponTypeSchema = z.enum(['percent', 'fixedPaise']);

export const couponSchema = z.object({
  code: z.string().min(2).max(40),
  type: couponTypeSchema,
  value: z.number().int().positive(),
  applicablePlans: z.array(paidPlanSchema).min(1),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  redemptionCount: z.number().int().min(0).default(0),
  perUserLimit: z.number().int().positive().default(1),
  active: z.boolean(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  description: z.string().max(500).optional().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Coupon = z.infer<typeof couponSchema>;

export const adminCreateCouponSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(40)
    .transform((s) => s.trim().toUpperCase()),
  type: couponTypeSchema,
  value: z.number().int().positive(),
  applicablePlans: z.array(paidPlanSchema).min(1).default(['pro', 'max']),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().positive().default(1),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export type AdminCreateCouponInput = z.infer<typeof adminCreateCouponSchema>;

export const adminUpdateCouponSchema = z.object({
  type: couponTypeSchema.optional(),
  value: z.number().int().positive().optional(),
  applicablePlans: z.array(paidPlanSchema).min(1).optional(),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export type AdminUpdateCouponInput = z.infer<typeof adminUpdateCouponSchema>;

export const validateCouponSchema = z.object({
  code: z.string().min(1).max(40),
  plan: paidPlanSchema,
});

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;

export const validateCouponResultSchema = z.object({
  code: z.string(),
  plan: paidPlanSchema,
  originalAmountPaise: z.number().int().min(0),
  discountPaise: z.number().int().min(0),
  finalAmountPaise: z.number().int().min(0),
  label: z.string(),
});

export type ValidateCouponResult = z.infer<typeof validateCouponResultSchema>;

/** Compute first-cycle discount; never goes below 0. */
export function computeCouponDiscount(
  amountPaise: number,
  type: 'percent' | 'fixedPaise',
  value: number
): { discountPaise: number; finalAmountPaise: number } {
  const discountPaise =
    type === 'percent'
      ? Math.min(amountPaise, Math.floor((amountPaise * value) / 100))
      : Math.min(amountPaise, value);
  return {
    discountPaise,
    finalAmountPaise: Math.max(0, amountPaise - discountPaise),
  };
}
