import { z } from 'zod';
import { paidPlanSchema, planTierSchema } from './models';

export const adminUsersQuerySchema = z.object({
  q: z.string().optional(),
  plan: planTierSchema.optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminPatchUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export type AdminPatchUserInput = z.infer<typeof adminPatchUserSchema>;

export const adminSetPlanSchema = z.object({
  action: z.enum(['grant', 'extend', 'revoke']),
  plan: paidPlanSchema.optional(),
  days: z.number().int().min(1).max(3650).optional(),
});

export type AdminSetPlanInput = z.infer<typeof adminSetPlanSchema>;

export const adminSubscriptionsQuerySchema = z.object({
  status: z.string().optional(),
  tier: paidPlanSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminSubscriptionsQuery = z.infer<
  typeof adminSubscriptionsQuerySchema
>;

export const adminExtendSubscriptionSchema = z.object({
  days: z.number().int().min(1).max(3650),
});

export type AdminExtendSubscriptionInput = z.infer<
  typeof adminExtendSubscriptionSchema
>;

export const adminPaymentsQuerySchema = z.object({
  status: z.enum(['created', 'paid', 'failed']).optional(),
  plan: paidPlanSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;

export const adminUpdatePlanSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  amountPaise: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  limits: z
    .object({
      monthlyApplies: z.number().int().min(0),
      monthlyScans: z.number().int().min(0),
      appliesPerHour: z.number().int().min(0),
      appliesPerDay: z.number().int().min(0),
    })
    .optional(),
});

export type AdminUpdatePlanInput = z.infer<typeof adminUpdatePlanSchema>;

export const adminAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;

export const adminMetricsQuerySchema = z.object({
  /** Preset window or calendar month/year. `days` kept for backward compatibility. */
  range: z.enum(['7d', '30d', '90d', 'month', 'year']).optional(),
  days: z.coerce.number().int().min(7).max(90).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;
