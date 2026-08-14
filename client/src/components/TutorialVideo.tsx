import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import {
  TUTORIAL_VIDEO_AUTOPLAY_EMBED_URL,
  TUTORIAL_VIDEO_EMBED_URL,
  TUTORIAL_VIDEO_HEIGHT,
  TUTORIAL_VIDEO_TITLE,
  TUTORIAL_VIDEO_URL,
  TUTORIAL_VIDEO_WIDTH,
} from '../lib/tutorialVideo';

type TutorialVideoProps = {
  /** Compact layout for dashboard panels */
  compact?: boolean;
  showCaption?: boolean;
  /** Hide the “Open on YouTube” link under the player. */
  hideFallbackLink?: boolean;
  /**
   * Show the native YouTube Shorts embed immediately (channel header,
   * progress bar, Shorts badge) instead of a custom poster.
   */
  shortsPlayer?: boolean;
  /**
   * Mount a muted autoplay iframe the first time this player scrolls into view.
   * Prefer this over the YouTube IFrame API (which spams console postMessage errors).
   */
  autoplayOnView?: boolean;
  className?: string;
};

export function TutorialVideo({
  compact = false,
  showCaption = true,
  hideFallbackLink = false,
  shortsPlayer = false,
  autoplayOnView = false,
  className = '',
}: TutorialVideoProps) {
  const rootRef = useRef<HTMLElement>(null);
  const isInView = useInView(rootRef, {
    once: true,
    amount: 0.35,
  });
  const [activated, setActivated] = useState(!autoplayOnView);

  useEffect(() => {
    if (!autoplayOnView) return;
    if (isInView) setActivated(true);
  }, [autoplayOnView, isInView]);

  const embedSrc = autoplayOnView
    ? TUTORIAL_VIDEO_AUTOPLAY_EMBED_URL
    : TUTORIAL_VIDEO_EMBED_URL;

  return (
    <figure
      ref={rootRef}
      className={`tutorial-video${compact ? ' tutorial-video--compact' : ''}${shortsPlayer ? ' tutorial-video--shorts' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="tutorial-video__frame">
        {activated ? (
          <iframe
            src={embedSrc}
            title={TUTORIAL_VIDEO_TITLE}
            width={TUTORIAL_VIDEO_WIDTH}
            height={TUTORIAL_VIDEO_HEIGHT}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div
            className="tutorial-video__api-host tutorial-video__api-host--idle"
            aria-hidden
          />
        )}
      </div>
      {showCaption ? (
        <figcaption className="tutorial-video__caption">
          <a
            href={TUTORIAL_VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch on YouTube
          </a>
          {' — '}
          install the extension and walk through Cosmo step by step.
        </figcaption>
      ) : null}
      {!showCaption && !hideFallbackLink && !shortsPlayer ? (
        <a
          className="tutorial-video__fallback"
          href={TUTORIAL_VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on YouTube
        </a>
      ) : null}
    </figure>
  );
}
