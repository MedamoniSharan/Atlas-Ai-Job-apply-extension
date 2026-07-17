import type { JobPayload } from '@codexcareer/shared';
import { resolveAdapter } from '../adapters';
import { logger } from '../core/logger';

const adapter = resolveAdapter(window.location.href);

if (!adapter) {
  logger.debug('No adapter for page', { href: window.location.href });
} else {
  logger.info('Adapter matched', { platform: adapter.platform });

  let lastFingerprint = '';

  function fingerprint(job: Partial<JobPayload>): string {
    return `${job.title}|${job.company}|${job.url ?? ''}`;
  }

  function emitJob() {
    const job = adapter!.readJob(document);
    if (!job?.title || !job.company) return;

    const fp = fingerprint(job);
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;

    const status =
      adapter!.detectApplicationStatus(document) ?? job.status ?? 'detected';
    const payload: JobPayload = {
      platform: adapter!.platform,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url ?? window.location.href,
      externalJobId: job.externalJobId,
      status,
      appliedAt:
        status === 'applied' ? new Date().toISOString() : undefined,
    };

    const messageType =
      status === 'applied' ? 'APPLICATION_RECORDED' : 'JOB_DETECTED';

    chrome.runtime.sendMessage({ type: messageType, payload }, () => {
      if (chrome.runtime.lastError) {
        logger.warn('Failed to send message', {
          error: chrome.runtime.lastError.message,
        });
      }
    });
  }

  emitJob();

  const observer = new MutationObserver(() => {
    emitJob();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Capture apply button clicks as application signals when success UI is missing.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const applyBtn = target.closest(
        'button, a, [role="button"]'
      ) as HTMLElement | null;
      const label = applyBtn?.textContent?.toLowerCase() ?? '';
      if (label.includes('apply')) {
        setTimeout(() => {
          const job = adapter!.readJob(document);
          if (!job?.title || !job.company) return;
          const payload: JobPayload = {
            platform: adapter!.platform,
            title: job.title,
            company: job.company,
            location: job.location,
            url: window.location.href,
            externalJobId: job.externalJobId,
            status: 'applied',
            appliedAt: new Date().toISOString(),
          };
          chrome.runtime.sendMessage({
            type: 'APPLICATION_RECORDED',
            payload,
          });
        }, 1500);
      }
    },
    true
  );
}
