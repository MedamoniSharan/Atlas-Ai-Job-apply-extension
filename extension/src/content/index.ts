import type { JobPayload } from '@cosmo/shared';
import {
  NaukriAdapter,
  SearchResultJob,
  hasNaukriSessionCookieHint,
} from '../adapters/naukriAdapter';
import { resolveAdapter } from '../adapters';
import { logger } from '../core/logger';
import { mountCopilotPanel } from './copilotPanel';

const naukri = new NaukriAdapter();
let lastFingerprint = '';
let applyClickBound = false;

function fingerprint(job: Partial<JobPayload>): string {
  return `${job.title}|${job.company}|${job.url ?? ''}|${job.status ?? ''}`;
}

function emitJob(adapter = resolveAdapter(window.location.href)) {
  if (!adapter) return;

  const job = adapter.readJob(document);
  if (!job?.title || !job.company) return;

  const status =
    adapter.detectApplicationStatus(document) ?? job.status ?? 'detected';
  const payload: JobPayload = {
    ...job,
    platform: adapter.platform,
    title: job.title,
    company: job.company,
    url: job.url ?? window.location.href,
    status,
    appliedAt: status === 'applied' ? new Date().toISOString() : undefined,
    metadata: { ...(job.metadata ?? {}), source: 'manual' },
  };

  const fp = fingerprint(payload);
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

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

function bindApplyClickCapture() {
  if (applyClickBound) return;
  applyClickBound = true;

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const applyBtn = target.closest(
        'button, a, [role="button"]'
      ) as HTMLElement | null;
      const label = applyBtn?.textContent?.toLowerCase() ?? '';
      if (!label.includes('apply')) return;

      setTimeout(() => {
        const current = resolveAdapter(window.location.href);
        if (!current) return;
        const job = current.readJob(document);
        if (!job?.title || !job.company) return;
        const payload: JobPayload = {
          ...job,
          platform: current.platform,
          title: job.title,
          company: job.company,
          url: window.location.href,
          status: 'applied',
          appliedAt: new Date().toISOString(),
          metadata: { ...(job.metadata ?? {}), source: 'manual' },
        };
        lastFingerprint = fingerprint(payload);
        chrome.runtime.sendMessage({
          type: 'APPLICATION_RECORDED',
          payload,
        });
      }, 1500);
    },
    true
  );
}

function onPossibleNavigation() {
  emitJob();
}

function patchHistory() {
  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history);
    history[method] = function (...args: Parameters<History['pushState']>) {
      const result = original(...args);
      onPossibleNavigation();
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', onPossibleNavigation);
}

async function runEasyApply(): Promise<{
  ok: boolean;
  skipped?: boolean;
  alreadyApplied?: boolean;
  needsUserInput?: boolean;
  blocked?: boolean;
  reason?: string;
  job?: Partial<JobPayload>;
}> {
  const blockReason = naukri.detectNaukriBlockPage(document);
  if (blockReason) {
    return { ok: false, blocked: true, reason: blockReason };
  }

  const loginStatus = naukri.getLoginStatus(document);
  if (loginStatus !== 'loggedIn') {
    return {
      ok: false,
      skipped: true,
      reason:
        loginStatus === 'uncertain'
          ? 'Confirm you’re logged into Naukri'
          : 'Naukri login required',
      job: naukri.readJob(document) ?? undefined,
    };
  }

  const job = naukri.readJob(document) ?? undefined;

  // Success page / already applied must win over leftover questionnaire DOM.
  if (naukri.detectApplicationStatus(document) === 'applied') {
    return {
      ok: true,
      alreadyApplied: naukri.isAlreadyApplied(document),
      job,
    };
  }

  if (naukri.isCompanySiteApply(document)) {
    return {
      ok: false,
      skipped: true,
      reason: 'Apply on company site — skipped',
      job,
    };
  }

  const loginBlock = (() => {
    const text = (document.body?.innerText || '').toLowerCase();
    if (text.includes('login to apply') || text.includes('register to apply')) {
      return 'Naukri login required';
    }
    return null;
  })();
  if (loginBlock) {
    return { ok: false, skipped: true, reason: loginBlock, job };
  }

  const questionsBefore = naukri.detectNeedsUserQuestions(document);
  if (questionsBefore) {
    return {
      ok: false,
      needsUserInput: true,
      reason: questionsBefore,
      job,
    };
  }

  const btn = naukri.findEasyApplyButton(document);
  if (!btn) {
    return {
      ok: false,
      skipped: true,
      reason: 'Easy Apply button not found',
      job,
    };
  }

  const label = (btn.textContent || '').toLowerCase();
  if (/company site|external/.test(label)) {
    return {
      ok: false,
      skipped: true,
      reason: 'External / company-site apply',
      job,
    };
  }

  btn.click();
  await new Promise((r) => setTimeout(r, 2200));

  if (naukri.detectApplicationStatus(document) === 'applied') {
    return {
      ok: true,
      alreadyApplied: naukri.isAlreadyApplied(document),
      job: naukri.readJob(document) ?? job,
    };
  }

  const questionsAfter = naukri.detectNeedsUserQuestions(document);
  if (questionsAfter) {
    return {
      ok: false,
      needsUserInput: true,
      reason: questionsAfter,
      job: naukri.readJob(document) ?? job,
    };
  }

  const loginAfter = (() => {
    const text = (document.body?.innerText || '').toLowerCase();
    if (text.includes('login to apply') || text.includes('register to apply')) {
      return 'Naukri login required';
    }
    return null;
  })();
  if (loginAfter) {
    return {
      ok: false,
      skipped: true,
      reason: loginAfter,
      job: naukri.readJob(document) ?? job,
    };
  }

  if (naukri.detectApplicationStatus(document) === 'applied') {
    return {
      ok: true,
      alreadyApplied: naukri.isAlreadyApplied(document),
      job: naukri.readJob(document) ?? job,
    };
  }

  const afterLabel = (btn.textContent || '').toLowerCase();
  if (
    /applied|applied successfully/.test(afterLabel) ||
    btn.hasAttribute('disabled')
  ) {
    return {
      ok: true,
      alreadyApplied: naukri.isAlreadyApplied(document),
      job: naukri.readJob(document) ?? job,
    };
  }

  // No questionnaire detected — treat as applied for Easy Apply.
  return {
    ok: true,
    alreadyApplied: naukri.isAlreadyApplied(document),
    job: naukri.readJob(document) ?? job,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'CHECK_LOGIN': {
        // Header auth controls can render slightly after document_idle.
        await new Promise((r) => setTimeout(r, 300));
        const status = naukri.getLoginStatus(document);
        const cookieHint = hasNaukriSessionCookieHint(document.cookie);
        sendResponse({
          status,
          loggedIn: status === 'loggedIn',
          cookieHint,
        });
        break;
      }
      case 'SHOW_LOGIN_PROMPT': {
        sendResponse({ ok: true, reason: message?.reason ?? null });
        break;
      }
      case 'CLICK_NEXT_PAGE': {
        const clicked = naukri.clickNextSearchPage(document);
        if (clicked.ok) {
          sendResponse(clicked);
          break;
        }
        const nextUrl = naukri.nextSearchPageUrl(window.location.href);
        if (nextUrl) {
          window.location.href = nextUrl;
          sendResponse({ ok: true, via: 'url' });
          break;
        }
        sendResponse(clicked);
        break;
      }
      case 'CHECK_BLOCK_PAGE': {
        const reason = naukri.detectNaukriBlockPage(document);
        sendResponse({ blocked: Boolean(reason), reason: reason ?? undefined });
        break;
      }
      case 'CHECK_APPLY_STATUS': {
        sendResponse({
          applied: naukri.detectApplicationStatus(document) === 'applied',
          needsQuestions: Boolean(naukri.detectNeedsUserQuestions(document)),
          href: window.location.href,
        });
        break;
      }
      case 'READ_JOB_DETAIL': {
        const job = naukri.readJob(document);
        sendResponse({
          job: job ?? null,
          companySiteApply: naukri.isCompanySiteApply(document),
        });
        break;
      }
      case 'RUN_SCAN_SCRAPE': {
        const jobs: SearchResultJob[] = naukri.readSearchResults(document);
        logger.info('Scan scrape complete', { count: jobs.length });
        sendResponse({ jobs });
        break;
      }
      case 'SCROLL_SEARCH_RESULTS': {
        const before = document.querySelectorAll(
          '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id]'
        ).length;
        const step = Math.max(480, Math.floor(window.innerHeight * 0.85));
        window.scrollBy({ top: step, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 1200));
        // Nudge again so lazy-loaded cards appear.
        window.scrollBy({ top: Math.floor(step * 0.4), behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 900));
        const after = document.querySelectorAll(
          '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id]'
        ).length;
        sendResponse({ ok: true, before, after });
        break;
      }
      case 'RUN_EASY_APPLY': {
        const result = await runEasyApply();
        sendResponse(result);
        break;
      }
      default:
        sendResponse({ ok: false });
    }
  })();
  return true;
});

patchHistory();
bindApplyClickCapture();
mountCopilotPanel();
emitJob();

const observer = new MutationObserver(() => {
  emitJob();
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
