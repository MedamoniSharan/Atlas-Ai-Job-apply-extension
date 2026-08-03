import { setTrustedSvg } from './dom';

const PAUSE_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="cosmo-fi-icon cosmo-fi-pause">
  <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor"/>
  <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor"/>
</svg>`;

const PLAY_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="cosmo-fi-icon cosmo-fi-play">
  <path fill="currentColor" d="M8.2 5.4c-.7-.4-1.5.1-1.5.9v11.4c0 .8.8 1.3 1.5.9l9.6-5.7c.7-.4.7-1.4 0-1.8L8.2 5.4z"/>
</svg>`;

const STOP_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="cosmo-fi-icon cosmo-fi-stop">
  <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="2.8" fill="currentColor"/>
</svg>`;

const MINIMIZE_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" class="cosmo-fi-icon cosmo-fi-minimize">
  <rect x="5" y="11" width="14" height="2.2" rx="1.1" fill="currentColor"/>
</svg>`;

export function mountPauseIcon(host: HTMLElement) {
  setTrustedSvg(host, PAUSE_SVG);
}

export function mountPlayIcon(host: HTMLElement) {
  setTrustedSvg(host, PLAY_SVG);
}

export function mountStopIcon(host: HTMLElement) {
  setTrustedSvg(host, STOP_SVG);
}

export function mountMinimizeIcon(host: HTMLElement) {
  setTrustedSvg(host, MINIMIZE_SVG);
}

function mountLabeledDots(host: HTMLElement, text: string): void {
  host.replaceChildren();

  const label = document.createElement('span');
  label.className = 'run-label';
  label.append(text);

  const dots = document.createElement('span');
  dots.className = 'run-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    dots.appendChild(document.createElement('i')).textContent = '.';
  }
  label.appendChild(dots);
  host.append(label);
}

/** Build the Start button's "Scanning" state with animated dots (no innerHTML). */
export function mountScanningButton(host: HTMLElement): void {
  mountLabeledDots(host, 'Scanning');
}

/** Build the Start button's "Running" state with a looping video (no innerHTML). */
export function mountRunningButton(host: HTMLElement, src: string): void {
  host.replaceChildren();

  const anim = document.createElement('span');
  anim.className = 'run-anim run-anim--video';
  anim.setAttribute('aria-hidden', 'true');

  const video = document.createElement('video');
  video.src = src;
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  anim.appendChild(video);

  const label = document.createElement('span');
  label.className = 'run-label';
  label.append('Running');

  const dots = document.createElement('span');
  dots.className = 'run-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    dots.appendChild(document.createElement('i')).textContent = '.';
  }
  label.appendChild(dots);

  host.append(anim, label);
  void video.play().catch(() => undefined);
}
