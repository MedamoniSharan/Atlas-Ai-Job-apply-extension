import type { JobPayload } from '@atlas/shared';
import {
  NaukriAdapter,
  SearchResultJob,
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
  reason?: string;
  job?: Partial<JobPayload>;
}> {
  // Never click Apply from the search list — only on an opened job page.
  if (!isJobDetailPage()) {
    return {
      ok: false,
      skipped: true,
      reason: 'Job page not open yet',
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

function normalizeHref(href: string): string {
  try {
    const u = new URL(href, window.location.href);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return href.split('?')[0]?.replace(/\/$/, '') || href;
  }
}

function findSearchJobCard(opts: {
  externalJobId?: string;
  url?: string;
}): { root: Element; titleEl: HTMLAnchorElement } | null {
  const cards = Array.from(
    document.querySelectorAll(
      '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id], [class*="jobTuple"]'
    )
  );
  const wantUrl = opts.url ? normalizeHref(opts.url) : '';
  const wantId = opts.externalJobId?.trim() || '';

  for (const card of cards) {
    const titleEl =
      (card.querySelector('a.title') as HTMLAnchorElement | null) ??
      (card.querySelector('a[href*="job-listings"]') as HTMLAnchorElement | null);
    if (!titleEl?.href) continue;
    const href = normalizeHref(titleEl.href);
    const id =
      card.getAttribute('data-job-id') ||
      href.match(/-(\d{6,})(?:\/|$)/)?.[1] ||
      '';
    if (wantId && id && id === wantId) {
      return { root: card, titleEl };
    }
    if (wantUrl && href === wantUrl) {
      return { root: card, titleEl };
    }
  }
  return null;
}

function listCardsVisible(): boolean {
  return (
    document.querySelectorAll(
      '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id], a.title[href*="job-listings"]'
    ).length > 0 && !isJobDetailPage()
  );
}

function isJobDetailPage(): boolean {
  const path = window.location.pathname || '';
  if (/\/job-listings\//i.test(path) || /\/jobdescription/i.test(path)) {
    return true;
  }
  // Naukri sometimes keeps a soft URL but renders the JD pane.
  if (
    document.querySelector(
      '.jd-header-title, h1.jd-header-title, [class*="jd-header-title"], .styles_jd-header-title'
    )
  ) {
    return true;
  }
  return false;
}

async function waitForJobDetail(timeoutMs = 12000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isJobDetailPage()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return isJobDetailPage();
}

async function clickSearchJob(opts: {
  externalJobId?: string;
  url?: string;
}): Promise<{ ok: boolean; reason?: string; navigated?: boolean }> {
  const found = findSearchJobCard(opts);
  if (!found) {
    return { ok: false, reason: 'Job card not found on list' };
  }
  const href = found.titleEl.href;
  found.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise((r) => setTimeout(r, 700));

  // Prefer a real user-like click; React apps often need a full MouseEvent.
  found.titleEl.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
    })
  );
  // Also call native click as backup.
  found.titleEl.click();

  let opened = await waitForJobDetail(5000);
  if (!opened && href) {
    // SPA swallowed the click — navigate explicitly to the job URL.
    window.location.href = href;
    opened = await waitForJobDetail(10000);
  }

  if (!opened) {
    return {
      ok: false,
      reason: 'Click did not open job detail page',
      navigated: false,
    };
  }
  return { ok: true, navigated: true };
}

async function historyBackToList(
  timeoutMs = 8000
): Promise<{ ok: boolean; reason?: string }> {
  if (listCardsVisible()) {
    return { ok: true };
  }
  history.back();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 350));
    if (listCardsVisible()) return { ok: true };
  }
  return {
    ok: listCardsVisible(),
    reason: listCardsVisible() ? undefined : 'Back did not restore search list',
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'CHECK_LOGIN': {
        // Header auth controls can render slightly after document_idle.
        await new Promise((r) => setTimeout(r, 300));
        sendResponse({ loggedIn: naukri.isLoggedIn(document) });
        break;
      }
      case 'SHOW_LOGIN_PROMPT': {
        sendResponse({ ok: true });
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
        // Let "Read more" expansions and lazy JD blocks settle.
        await new Promise((r) => setTimeout(r, 350));
        const job = naukri.readJob(document);
        sendResponse({ job: job ?? null });
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
      case 'CLICK_SEARCH_JOB': {
        const result = await clickSearchJob({
          externalJobId: message.externalJobId,
          url: message.url,
        });
        sendResponse(result);
        break;
      }
      case 'HISTORY_BACK': {
        const result = await historyBackToList(
          typeof message.timeoutMs === 'number' ? message.timeoutMs : 8000
        );
        sendResponse(result);
        break;
      }
      case 'IS_JOB_DETAIL': {
        sendResponse({ ok: true, isDetail: isJobDetailPage() });
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
