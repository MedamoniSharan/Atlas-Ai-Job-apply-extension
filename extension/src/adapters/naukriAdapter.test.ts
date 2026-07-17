import { describe, expect, it } from 'vitest';
import { NaukriAdapter, naukriSelectors } from './naukriAdapter';
import { backoffMs } from '../core/queueManager';

describe('NaukriAdapter', () => {
  it('matches naukri job URLs', () => {
    const adapter = new NaukriAdapter();
    expect(
      adapter.matches(
        'https://www.naukri.com/job-listings-frontend-engineer-123'
      )
    ).toBe(true);
    expect(adapter.matches('https://linkedin.com/jobs/view/1')).toBe(false);
  });

  it('exposes a selector registry', () => {
    expect(naukriSelectors.title.length).toBeGreaterThan(0);
    expect(naukriSelectors.company.length).toBeGreaterThan(0);
  });

  it('reads job fields from fixture DOM', () => {
    const adapter = new NaukriAdapter();
    document.body.innerHTML = `
      <h1 class="jd-header-title">Frontend Engineer</h1>
      <div class="jd-header-comp-name"><a>Atlas Labs</a></div>
      <div class="loc"><span>Bengaluru</span></div>
    `;
    const job = adapter.readJob(document);
    expect(job?.title).toBe('Frontend Engineer');
    expect(job?.company).toBe('Atlas Labs');
    expect(job?.location).toBe('Bengaluru');
  });
});

describe('queue backoff', () => {
  it('grows exponentially and caps', () => {
    expect(backoffMs(0)).toBe(2000);
    expect(backoffMs(1)).toBe(4000);
    expect(backoffMs(10)).toBe(5 * 60 * 1000);
  });
});
