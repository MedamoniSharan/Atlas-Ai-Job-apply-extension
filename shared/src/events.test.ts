import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema, jobPayloadSchema } from './events';
import { fail, ok } from './api';

describe('eventEnvelopeSchema', () => {
  it('accepts a valid event envelope', () => {
    const result = eventEnvelopeSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: new Date().toISOString(),
      type: 'ApplicationRecorded',
      payload: { title: 'SDE', company: 'Acme' },
      retryCount: 0,
      syncStatus: 'pending',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid event types', () => {
    const result = eventEnvelopeSchema.safeParse({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: new Date().toISOString(),
      type: 'NotARealEvent',
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('jobPayloadSchema', () => {
  it('parses naukri job payload', () => {
    const result = jobPayloadSchema.safeParse({
      platform: 'naukri',
      title: 'Frontend Engineer',
      company: 'CodeX',
      location: 'Bengaluru',
      status: 'applied',
    });
    expect(result.success).toBe(true);
  });
});

describe('api helpers', () => {
  it('builds success and fail responses', () => {
    expect(ok({ id: '1' }).success).toBe(true);
    expect(fail('Nope').success).toBe(false);
  });
});
