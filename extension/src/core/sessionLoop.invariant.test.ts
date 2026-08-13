import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('botRunner continuous session invariants (source)', () => {
  const src = readFileSync(path.join(root, 'src/core/botRunner.ts'), 'utf8');

  it('stops on applied+skipped ceiling helpers', () => {
    expect(src).toContain('hasHitProcessCeiling');
    expect(src).toContain('remainingProcessSlots');
    expect(src).toContain('sessionProcessedCount');
    expect(src).toMatch(/Filters once per search, then scan → apply continuously until/);
  });

  it('applies queued matches before switching/ending a search', () => {
    expect(src).toContain('Phase 2: always apply what we queued before ending or switching');
    expect(src).toContain('applyCollectedJobs');
    // Must not early-return on filter failure before the loop can apply prior queue —
    // filter failure now breaks the loop instead of return { ok:false } mid-batch.
    expect(src).toMatch(
      /Stopped while applying Naukri filters[\s\S]{0,120}hitLimit = true/
    );
  });

  it('auto-paginates during scan and never asks the user for Next page', () => {
    expect(src).toContain('Auto next page');
    expect(src).toContain('goToNextSearchPage');
    expect(src).not.toMatch(/ask.*Next page/i);
  });
});

describe('built background.js continuous loop (dist)', () => {
  it('ships the applied+skipped continuous loop', () => {
    const built = path.join(root, 'dist/background.js');
    const js = readFileSync(built, 'utf8');
    expect(js).toContain('applied+skipped');
    expect(js).toContain('hasHitProcessCeiling');
    expect(js).toContain('remainingProcessSlots');
    expect(js).toContain('Filters once per search, then scan');
    expect(js).toContain('filterBatch');
    expect(js).toMatch(/Reached \$\{processed\} applied\+skipped/);
    // Regression: old collect-all-searches-first copy.
    expect(js).not.toContain('Will try up to');
  });
});
