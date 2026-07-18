import { z } from 'zod';

export const eventTypeSchema = z.enum([
  'ExtensionConnected',
  'LoginDetected',
  'JobDetected',
  'ApplicationRecorded',
  'SyncStarted',
  'SyncCompleted',
  'SyncFailed',
  'NotificationCreated',
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export const syncStatusSchema = z.enum(['pending', 'syncing', 'synced', 'failed']);

export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const platformSchema = z.enum([
  'naukri',
  'linkedin',
  'foundit',
  'indeed',
  'wellfound',
  'internshala',
  'unknown',
]);

export type Platform = z.infer<typeof platformSchema>;

export const jobPayloadSchema = z.object({
  platform: platformSchema,
  externalJobId: z.string().optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  url: z.string().url().optional(),
  companyLogo: z.string().min(1).optional(),
  description: z.string().max(4000).optional(),
  experience: z.string().optional(),
  salary: z.string().optional(),
  skills: z.array(z.string()).max(40).optional(),
  rating: z.string().optional(),
  appliedAt: z.string().datetime().optional(),
  status: z
    .enum(['detected', 'applied', 'viewed', 'saved'])
    .default('detected'),
  metadata: z.record(z.unknown()).optional(),
});

export type JobPayload = z.infer<typeof jobPayloadSchema>;

export const eventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  type: eventTypeSchema,
  payload: z.record(z.unknown()),
  retryCount: z.number().int().nonnegative().default(0),
  syncStatus: syncStatusSchema.default('pending'),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const syncEventsRequestSchema = z.object({
  events: z.array(eventEnvelopeSchema).min(1).max(100),
});

export type SyncEventsRequest = z.infer<typeof syncEventsRequestSchema>;
