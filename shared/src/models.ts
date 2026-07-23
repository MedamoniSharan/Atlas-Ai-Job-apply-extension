import { z } from 'zod';
import { platformSchema } from './events';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const googleAuthSchema = z.object({
  code: z.string().min(1),
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const planTierSchema = z.enum(['free', 'pro', 'max']);

export type PlanTier = z.infer<typeof planTierSchema>;

export const userRoleSchema = z.enum(['user', 'admin']);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['active', 'suspended']);

export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  plan: planTierSchema.optional(),
  planExpiresAt: z.string().datetime().optional(),
  createdAt: z.string().datetime().optional(),
  extensionConnectedAt: z.string().datetime().optional(),
});

export type User = z.infer<typeof userSchema>;

export const paidPlanSchema = z.enum(['pro', 'max']);

export type PaidPlan = z.infer<typeof paidPlanSchema>;

export const createBillingOrderSchema = z.object({
  plan: paidPlanSchema,
});

export type CreateBillingOrderInput = z.infer<typeof createBillingOrderSchema>;

export const verifyBillingPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: paidPlanSchema,
});

export type VerifyBillingPaymentInput = z.infer<
  typeof verifyBillingPaymentSchema
>;

export const createSubscriptionSchema = z.object({
  plan: paidPlanSchema,
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const verifySubscriptionSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  plan: paidPlanSchema,
});

export type VerifySubscriptionInput = z.infer<typeof verifySubscriptionSchema>;

export const cancelSubscriptionSchema = z.object({
  immediate: z.boolean().optional().default(false),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;

export const subscriptionStatusSchema = z.enum([
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'cancelled',
  'completed',
  'expired',
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const PLAN_PRICES_PAISE = {
  pro: 9900,
  max: 29900,
} as const satisfies Record<PaidPlan, number>;

export const PLAN_DISPLAY_NAMES = {
  free: 'Basic',
  pro: 'Premium',
  max: 'UltraMag',
} as const satisfies Record<PlanTier, string>;

export const workModeSchema = z.enum(['any', 'office', 'hybrid', 'remote']);

export type WorkMode = z.infer<typeof workModeSchema>;

export const jobPreferencesSchema = z.object({
  titles: z.array(z.string().min(1).max(120)).max(20).default([]),
  keywords: z.array(z.string().min(1).max(80)).max(30).default([]),
  locations: z.array(z.string().min(1).max(120)).max(20).default([]),
  experienceMin: z.number().int().min(0).max(50).default(0),
  experienceMax: z.number().int().min(0).max(50).default(30),
  minSalaryLpa: z.number().min(0).max(500).optional(),
  workMode: workModeSchema.default('any'),
  autoScanEnabled: z.boolean().default(true),
  autoApplyEnabled: z.boolean().default(false),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

export const jobPreferencesUpdateSchema = jobPreferencesSchema;

export type JobPreferencesUpdate = z.infer<typeof jobPreferencesUpdateSchema>;

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  titles: [],
  keywords: [],
  locations: [],
  experienceMin: 0,
  experienceMax: 30,
  workMode: 'any',
  autoScanEnabled: true,
  autoApplyEnabled: false,
};

export function preferencesAreComplete(prefs: JobPreferences | null | undefined): boolean {
  if (!prefs) return false;
  return prefs.titles.length > 0 || prefs.keywords.length > 0;
}

export const onboardingStatusSchema = z.object({
  accountCreated: z.boolean(),
  extensionConnected: z.boolean(),
  preferencesCompleted: z.boolean(),
  hasApplications: z.boolean(),
  extensionConnectedAt: z.string().datetime().optional(),
});

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const applicationStatusSchema = z.enum([
  'detected',
  'applied',
  'viewed',
  'saved',
  'interview',
  'offer',
  'rejected',
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const applicationMetadataSchema = z
  .object({
    source: z.enum(['manual', 'auto_scan', 'auto_apply']).optional(),
    skipReason: z.string().optional(),
    skipped: z.boolean().optional(),
    companySiteApply: z.boolean().optional(),
  })
  .passthrough();

export type ApplicationMetadata = z.infer<typeof applicationMetadataSchema>;

export const applicationSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  userId: z.string(),
  platform: platformSchema,
  externalJobId: z.string().optional(),
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  url: z.string().optional(),
  companyLogo: z.string().optional(),
  description: z.string().optional(),
  experience: z.string().optional(),
  salary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  rating: z.string().optional(),
  reviews: z.string().optional(),
  postedAt: z.string().optional(),
  openings: z.string().optional(),
  applicants: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  role: z.string().optional(),
  industry: z.string().optional(),
  department: z.string().optional(),
  employmentType: z.string().optional(),
  roleCategory: z.string().optional(),
  education: z.string().optional(),
  aboutCompany: z.string().optional(),
  status: applicationStatusSchema,
  appliedAt: z.string().datetime().optional(),
  metadata: applicationMetadataSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Application = z.infer<typeof applicationSchema>;
