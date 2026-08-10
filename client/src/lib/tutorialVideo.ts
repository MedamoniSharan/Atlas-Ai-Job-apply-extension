/** Step-by-step Cosmo install & how-to walkthrough (YouTube Short). */
export const TUTORIAL_VIDEO_ID = '1Rv02UdoHLo';

export const TUTORIAL_VIDEO_URL =
  `https://www.youtube.com/shorts/${TUTORIAL_VIDEO_ID}` as const;

/** Standard YouTube Shorts embed size (9:16 phone). */
export const TUTORIAL_VIDEO_WIDTH = 315;
export const TUTORIAL_VIDEO_HEIGHT = 560;

/** Landing preview: play this many seconds then pause. */
export const TUTORIAL_VIDEO_PREVIEW_SECONDS = 19;

/** Native Shorts player chrome (channel, progress, Shorts badge). */
export const TUTORIAL_VIDEO_EMBED_URL =
  `https://www.youtube.com/embed/${TUTORIAL_VIDEO_ID}?playsinline=1&rel=0&controls=1&enablejsapi=1` as const;

export const TUTORIAL_VIDEO_TITLE =
  'How to install Cosmo and auto-apply to jobs — step-by-step';
