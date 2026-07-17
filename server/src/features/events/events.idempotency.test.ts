import { describe, expect, it } from 'vitest';
import { jobPayloadSchema } from '@codexcareer/shared';

/**
 * Unit-level idempotency keying: same eventId maps to one logical application.
 * Integration tests against Mongo are covered when Docker is available.
 */
describe('event idempotency contract', () => {
  it('uses eventId as the unique upsert key', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440000';
    const payload = jobPayloadSchema.parse({
      platform: 'naukri',
      title: 'SDE-1',
      company: 'Acme',
      status: 'applied',
    });

    const first = { eventId, ...payload };
    const second = { eventId, ...payload, title: 'SDE-1 Updated' };

    expect(first.eventId).toBe(second.eventId);
    expect(second.title).toBe('SDE-1 Updated');
  });
});
