import { describe, expect, it } from 'vitest';
import { setTrustedHtml, setTrustedSvg } from './dom';

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

describe('setTrustedSvg', () => {
  it('mounts SVG icons in the SVG namespace so they can lay out', () => {
    const host = document.createElement('button');
    document.body.appendChild(host);

    setTrustedSvg(
      host,
      `<svg viewBox="0 0 24 24" class="cosmo-fi-icon cosmo-fi-minimize">
        <rect x="5" y="11" width="14" height="2.2" rx="1.1" fill="currentColor"/>
      </svg>`
    );

    const svg = host.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(host.querySelector('.cosmo-fi-minimize')).toBeTruthy();
  });
});
