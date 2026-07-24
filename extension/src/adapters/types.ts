import type { JobPayload, Platform } from '@cosmo/shared';

export interface PlatformAdapter {
  readonly platform: Platform;
  matches(url: string): boolean;
  isLoggedIn(doc?: Document): boolean;
  readJob(doc?: Document): Partial<JobPayload> | null;
  detectApplicationStatus(doc?: Document): JobPayload['status'] | null;
}

export type SelectorRegistry = Record<string, string[]>;

export function queryFirst(
  selectors: string[],
  root: ParentNode = document
): Element | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function textOf(
  selectors: string[],
  root: ParentNode = document
): string | undefined {
  const el = queryFirst(selectors, root);
  const text = el?.textContent?.trim();
  return text || undefined;
}
