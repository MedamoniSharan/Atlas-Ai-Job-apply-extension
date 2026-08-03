import { describe, expect, it } from 'vitest';
import { setTrustedHtml } from './dom';

describe('setTrustedHtml', () => {
  it('preserves style tags that HTML5 parsing moves into head', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    setTrustedHtml(
      host,
      `
      <style>#cosmo { position: fixed; }</style>
      <div id="cosmo" class="panel">Hello</div>
      `
    );

    expect(host.querySelector('style')?.textContent).toContain('position: fixed');
    expect(host.querySelector('#cosmo')?.textContent).toBe('Hello');
  });
});
