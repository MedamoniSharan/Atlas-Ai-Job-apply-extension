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
    expect(src).toContain('mustApplyQueuedBeforeContinue');
    expect(src).toContain('applyCollectedJobs');
    expect(src).toContain('Could not apply Naukri filters');
    expect(src).toContain('trying next search');
    expect(src).toContain('MAX_PLAN_PASSES');
    expect(src).toContain('APPLY_CHUNK_SIZE');
    expect(src).toContain('startCopilotKeepAlive');
    expect(src).toContain('opts?.resume');
    expect(src).toContain('ensureLiveWorkTabId');
    expect(src).toContain('ensureLoggedInForSession');
    expect(src).toContain('alreadySeenMatches');
    expect(src).toContain('activeListUrl');
    expect(src).toContain('collected.exhausted');
    expect(src).toContain('isNaukriSearchListUrl');
    expect(src).not.toContain('if (filterBatch.length < chunkTarget)');

    const bg = readFileSync(path.join(root, 'src/background/index.ts'), 'utf8');
    expect(bg).toContain('resume: true');
    expect(bg).toContain('resumeInterruptedCopilotIfNeeded');
    expect(bg).toContain('cosmo-copilot-keepalive');

    // Regression: never break on ceiling between collect and apply.
    expect(src).not.toMatch(
      /hasHitProcessCeiling\(processed, SCAN_BATCH_SIZE\)\) break;\s*\n\s*if \(filterBatch\.length === 0\)/
    );
  });

  it('auto-paginates during scan and never asks the user for Next page', () => {
    expect(src).toContain('Auto next page');
    expect(src).toContain('goToNextSearchPage');
    expect(src).not.toMatch(/ask.*Next page/i);
  });

  it('bypasses company-site on the list without burning the applied+skipped ceiling', () => {
    expect(src).toContain('companySiteBypassed');
    expect(src).toContain(
      'Company site — bypassed (no Easy Apply, not counted)'
    );
    const listBypass = src.match(
      /if \(job\.companySiteApply\) \{[\s\S]*?continue;\s*\n\s*\}/
    )?.[0];
    expect(listBypass).toBeTruthy();
    expect(listBypass).not.toContain('upsertScannedJobs');
    expect(listBypass).not.toContain("'skipped'");
    expect(listBypass).toContain('companySiteBypassed');
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
