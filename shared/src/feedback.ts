import { z } from 'zod';

export const uninstallReasonSchema = z.enum([
  'not_useful',
  'bugs',
  'too_expensive',
  'privacy',
  'switched',
  'other',
]);

export type UninstallReason = z.infer<typeof uninstallReasonSchema>;

export const UNINSTALL_REASON_LABELS: Record<UninstallReason, string> = {
  not_useful: 'Didn’t find it useful',
  bugs: 'Bugs / not working',
  too_expensive: 'Too expensive',
  privacy: 'Privacy concerns',
  switched: 'Switched to another tool',
  other: 'Other',
};

export const uninstallFeedbackSubmitSchema = z.object({
  reason: uninstallReasonSchema,
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .or(z.literal('')),
  extensionVersion: z.string().trim().max(40).optional().or(z.literal('')),
  browser: z.string().trim().max(40).optional().or(z.literal('')),
  source: z
    .enum(['chrome', 'edge', 'firefox', 'other'])
    .optional()
    .default('chrome'),
});

export type UninstallFeedbackSubmit = z.infer<
  typeof uninstallFeedbackSubmitSchema
>;

export const adminUninstallFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  reason: uninstallReasonSchema.optional(),
});

export type AdminUninstallFeedbackQuery = z.infer<
  typeof adminUninstallFeedbackQuerySchema
>;
