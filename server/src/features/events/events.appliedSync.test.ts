import { describe, expect, it } from 'vitest';
import {
  isAppliedRecord,
  mergeApplicationMetadata,
  resolveApplicationStatus,
} from './events.service';

/**
 * Applied jobs used to vanish from the dashboard when a later scan re-emitted
 * JobDetected for the same job, resetting status and metadata.source.
 */
describe('applied job status resolution', () => {
  it('promotes ApplicationRecorded payloads that still say detected', () => {
    expect(resolveApplicationStatus('ApplicationRecorded', 'detected', false)).toBe(
      'applied'
    );
  });

  it('keeps a re-scanned applied job in the applied bucket', () => {
    expect(resolveApplicationStatus('JobDetected', 'detected', true)).toBe(
      'applied'
    );
  });

  it('still records a first-time detection as detected', () => {
    expect(resolveApplicationStatus('JobDetected', 'detected', false)).toBe(
      'detected'
    );
  });

  it('treats auto_apply source as applied even when status lags', () => {
    expect(isAppliedRecord('detected', { source: 'auto_apply' })).toBe(true);
    expect(isAppliedRecord('detected', { source: 'auto_scan' })).toBe(false);
    expect(isAppliedRecord('applied', {})).toBe(true);
  });
});

describe('application metadata merge', () => {
  it('does not relabel an applied job as auto_scan on re-scan', () => {
    const merged = mergeApplicationMetadata(
      { source: 'auto_apply' },
      { source: 'auto_scan' },
      true
    );
    expect(merged.source).toBe('auto_apply');
    expect(merged.skipped).toBe(false);
  });

  it('lets a normal detection keep its own source', () => {
    const merged = mergeApplicationMetadata(
      { source: 'auto_scan' },
      { source: 'manual' },
      false
    );
    expect(merged.source).toBe('manual');
  });

  it('preserves unrelated existing metadata', () => {
    const merged = mergeApplicationMetadata(
      { source: 'auto_apply', companySiteApply: true },
      { source: 'auto_scan' },
      true
    );
    expect(merged.companySiteApply).toBe(true);
  });
});
