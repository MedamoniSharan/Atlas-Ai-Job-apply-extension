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
  host.innerHTML = PAUSE_SVG;
}

export function mountPlayIcon(host: HTMLElement) {
  host.innerHTML = PLAY_SVG;
}

export function mountStopIcon(host: HTMLElement) {
  host.innerHTML = STOP_SVG;
}

export function mountMinimizeIcon(host: HTMLElement) {
  host.innerHTML = MINIMIZE_SVG;
}

export function runningVideoHtml(src: string): string {
  return `
    <span class="run-anim run-anim--video" aria-hidden="true">
      <video src="${src}" autoplay muted loop playsinline preload="auto"></video>
    </span>
    <span class="run-label">Running<span class="run-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
  `;
}
