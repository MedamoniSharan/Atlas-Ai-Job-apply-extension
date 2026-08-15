import type { JobPayload } from '@cosmo/shared';
import {
  NaukriAdapter,
  SearchResultJob,
  expandJobDetailSections,
  clickInSameTab,
  applyPreferenceFiltersAsync,
  preferenceFiltersAlreadyApplied,
  confirmPreferenceFilters,
  hasNaukriSessionCookieHint,
} from '../adapters/naukriAdapter';
import type { JobPreferences } from '@cosmo/shared';
import { resolveAdapter } from '../adapters';
import { logger } from '../core/logger';
import { ensureChromeNamespace } from '../shared/browser';
import { mountCopilotPanel } from './copilotPanel';

ensureChromeNamespace();

const naukri = new NaukriAdapter();
let lastFingerprint = '';
let applyClickBound = false;
let copilotRunning = false;

function refreshCopilotRunningFlag(): void {
  void chrome.storage.local.get(['copilotState'], (res) => {
    copilotRunning = Boolean(
      (res as { copilotState?: { running?: boolean } })?.copilotState?.running
    );
  });
}

/**
 * While Cosmo co-pilot is running, keep all Naukri navigations in this tab —
 * never spawn window.open / target=_blank tabs.
 */
function installSameTabNavigationGuard(): void {
  refreshCopilotRunningFlag();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.copilotState) return;
    const next = changes.copilotState.newValue as
      | { running?: boolean }
      | undefined;
    copilotRunning = Boolean(next?.running);
  });

  const previousOpen = window.open.bind(window);
  window.open = ((
    url?: string | URL | undefined,
    target?: string,
    features?: string
  ) => {
    if (
      copilotRunning &&
      url != null &&
      String(url) &&
      String(url) !== 'about:blank'
    ) {
      window.location.assign(String(url));
      return window;
    }
    return previousOpen(url, target, features);
  }) as typeof window.open;

  document.addEventListener(
    'click',
    (e) => {
      if (!copilotRunning) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target !== '_blank') return;
      a.setAttribute('target', '_self');
    },
    true
  );
}

installSameTabNavigationGuard();

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

/** Filter chips and "apply filters" controls also contain the word apply. */
const APPLY_BUTTON_TEXT = /^(easy apply|apply now|apply|submit application)$/;
const NOT_AN_APPLY_ACTION = /filter|save|sort|search|clear|refine/;

function looksLikeApplyButton(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.closest('[data-filter-id], input[type="checkbox"]')) return false;
  const label = (el.textContent ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!label || label.length > 30) return false;
  if (NOT_AN_APPLY_ACTION.test(label)) return false;
  return APPLY_BUTTON_TEXT.test(label);
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
      if (!looksLikeApplyButton(applyBtn)) return;

      setTimeout(() => {
        const current = resolveAdapter(window.location.href);
        if (!current) return;
        // Only record once the page itself confirms the application landed.
        if (current.detectApplicationStatus(document) !== 'applied') return;
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
      }, 2500);
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

async function dismissCompanyBenefitsIfOpen(): Promise<boolean> {
  if (!naukri.dismissCompanyBenefitsPopup(document)) return false;
  await new Promise((r) => setTimeout(r, 350));
  if (naukri.findCompanyBenefitsPopup(document)) {
    naukri.dismissCompanyBenefitsPopup(document);
    await new Promise((r) => setTimeout(r, 250));
  }
  return true;
}

function isEasyApplyLabel(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const label = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return label === 'apply' || label.includes('easy apply');
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

  // New Naukri side popup — close it so the existing Apply click can land.
  await dismissCompanyBenefitsIfOpen();

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
    // No Easy Apply — treat as company/external and skip (never invent a click).
    if (naukri.isCompanySiteApply(document)) {
      return {
        ok: false,
        skipped: true,
        reason: 'Apply on company site — skipped',
        job,
      };
    }
    return {
      ok: false,
      skipped: true,
      reason: 'Easy Apply button not found',
      job,
    };
  }

  const label = (btn.textContent || '').toLowerCase();
  if (
    /company site|external|company website|apply on company|apply to company/.test(
      label
    )
  ) {
    return {
      ok: false,
      skipped: true,
      reason: 'External / company-site apply',
      job,
    };
  }

  // Final guard: never follow off-Naukri apply links in this tab.
  if (btn instanceof HTMLAnchorElement) {
    const href = btn.href || '';
    if (href && !/naukri\.com/i.test(href)) {
      return {
        ok: false,
        skipped: true,
        reason: 'Apply on company site — skipped',
        job,
      };
    }
  }

  clickInSameTab(btn);

  const confirmApplied = (): boolean =>
    naukri.detectApplicationStatus(document) === 'applied';

  // Reconfirm against Naukri UI — do not assume success.
  let confirmed = false;
  let retriedAfterBenefits = false;
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (confirmApplied()) {
      confirmed = true;
      break;
    }
    if (naukri.detectNaukriBlockPage(document)) break;

    if (await dismissCompanyBenefitsIfOpen()) {
      if (!retriedAfterBenefits) {
        retriedAfterBenefits = true;
        const again = naukri.findEasyApplyButton(document);
        if (isEasyApplyLabel(again)) clickInSameTab(again);
      }
      continue;
    }

    if (naukri.detectNeedsUserQuestions(document)) break;

    // One retry click if Apply is still the visible CTA mid-poll.
    if (i === 5) {
      const again = naukri.findEasyApplyButton(document);
      if (isEasyApplyLabel(again)) clickInSameTab(again);
    }
  }

  if (confirmApplied() || confirmed) {
    return {
      ok: true,
      alreadyApplied: naukri.isAlreadyApplied(document),
      job: naukri.readJob(document) ?? job,
    };
  }

  const blockAfter = naukri.detectNaukriBlockPage(document);
  if (blockAfter) {
    return { ok: false, blocked: true, reason: blockAfter };
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

  // Still showing Apply / no success banner — do not mark applied.
  const stillApply = naukri.findEasyApplyButton(document);
  return {
    ok: false,
    skipped: true,
    reason: stillApply
      ? 'Apply clicked but Naukri did not confirm — not marked applied'
      : 'Apply not confirmed on Naukri',
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
        // Do not invent /foo-jobs-N URLs when Next is missing or disabled —
        // narrow searches often have only 1–2 real pages; fabricating more
        // just burns empty "pages" until MAX_EMPTY_PAGES.
        sendResponse(naukri.clickNextSearchPage(document));
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
        naukri.dismissCompanyBenefitsPopup(document);
        expandJobDetailSections(document);
        // Allow "Read more" expansions to paint before scraping.
        await new Promise((r) => setTimeout(r, 350));
        expandJobDetailSections(document);
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
      case 'APPLY_PREFERENCE_FILTERS': {
        const prefs = (message?.prefs ?? {}) as JobPreferences;
        const focusLocation =
          typeof message?.focusLocation === 'string'
            ? message.focusLocation
            : null;

        // Already matching — do not open All Filters / click again (causes blinks).
        if (preferenceFiltersAlreadyApplied(document, prefs, focusLocation)) {
          const report = confirmPreferenceFilters(
            document,
            prefs,
            focusLocation
          );
          sendResponse({
            ok: true,
            alreadyApplied: true,
            confirmed: report.ok,
            confirmDetails: report.details,
            openedAllFilters: false,
            applied: [],
            skipped: ['Filters already applied'],
            ready: true,
          });
          break;
        }

        // One apply pass + at most one retry. Nested retries used to re-tick
        // filters 5–7 times and reload Naukri on every first Start.
        let result = await applyPreferenceFiltersAsync(document, prefs, 200, {
          focusLocation,
        });
        if (!result.ready || !result.confirmed) {
          await new Promise((r) => setTimeout(r, 400));
          if (!preferenceFiltersAlreadyApplied(document, prefs, focusLocation)) {
            result = await applyPreferenceFiltersAsync(document, prefs, 200, {
              focusLocation,
            });
          }
        }

        const report = confirmPreferenceFilters(
          document,
          prefs,
          focusLocation
        );
        sendResponse({
          ...result,
          alreadyApplied: report.ok,
          confirmed: report.ok,
          confirmDetails: report.details,
        });
        break;
      }
      case 'CONFIRM_PREFERENCE_FILTERS': {
        const prefs = (message?.prefs ?? {}) as JobPreferences;
        const focusLocation =
          typeof message?.focusLocation === 'string'
            ? message.focusLocation
            : null;
        const report = confirmPreferenceFilters(
          document,
          prefs,
          focusLocation
        );
        sendResponse({
          confirmed: report.ok,
          details: report.details,
          salaryOk: report.salaryOk,
          workOk: report.workOk,
          locationOk: report.locationOk,
        });
        break;
      }
      case 'SCROLL_SEARCH_RESULTS': {
        const before = document.querySelectorAll(
          '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id]'
        ).length;
        const step = Math.max(480, Math.floor(window.innerHeight * 0.85));
        // Instant scroll while scanning — no smooth/slow animation waits.
        window.scrollBy(0, step);
        window.scrollBy(0, Math.floor(step * 0.4));
        const after = document.querySelectorAll(
          '.srp-jobtuple-wrapper, .cust-job-tuple, article.jobTuple, div.row[data-job-id]'
        ).length;
        sendResponse({ ok: true, before, after });
        break;
      }
      case 'PROBE_APPLY_READY': {
        naukri.dismissCompanyBenefitsPopup(document);
        sendResponse({
          ready: Boolean(
            naukri.findEasyApplyButton(document) &&
              !naukri.isCompanySiteApply(document)
          ),
          companySite: naukri.isCompanySiteApply(document),
          alreadyApplied: naukri.detectApplicationStatus(document) === 'applied',
        });
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
