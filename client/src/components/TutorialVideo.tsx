import { useEffect, useId, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import {
  TUTORIAL_VIDEO_EMBED_URL,
  TUTORIAL_VIDEO_HEIGHT,
  TUTORIAL_VIDEO_ID,
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
  /** Autoplay muted, then pause after this many seconds (landing preview). */
  stopAfterSeconds?: number;
  /**
   * Start muted autoplay only after this player scrolls into view.
   * Defaults to true when `stopAfterSeconds` is set.
   */
  playOnView?: boolean;
  className?: string;
};

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YtNamespace = {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YtPlayer }) => void;
        onStateChange?: (event: { data: number; target: YtPlayer }) => void;
      };
    },
  ) => YtPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeApi(): Promise<YtNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API requires a browser'));
  }
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    if (!document.querySelector('script[data-cosmo-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.cosmoYoutubeApi = 'true';
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export function TutorialVideo({
  compact = false,
  showCaption = true,
  hideFallbackLink = false,
  shortsPlayer = false,
  stopAfterSeconds,
  playOnView,
  className = '',
}: TutorialVideoProps) {
  const rawId = useId();
  const playerHostId = `cosmo-yt-${rawId.replace(/:/g, '')}`;
  const rootRef = useRef<HTMLElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const pollRef = useRef<number | null>(null);
  const previewStoppedRef = useRef(false);
  const useControlledPreview =
    typeof stopAfterSeconds === 'number' && stopAfterSeconds > 0;
  const shouldPlayOnView = playOnView ?? useControlledPreview;

  const isInView = useInView(rootRef, {
    once: false,
    amount: 0.45,
    margin: '0px 0px -8% 0px',
  });
  const isInViewRef = useRef(isInView);
  isInViewRef.current = isInView;
  const [activated, setActivated] = useState(!shouldPlayOnView);

  useEffect(() => {
    if (!shouldPlayOnView) return;
    if (isInView) setActivated(true);
  }, [isInView, shouldPlayOnView]);

  useEffect(() => {
    if (!useControlledPreview || !activated) return;

    let cancelled = false;
    const limit = stopAfterSeconds;
    previewStoppedRef.current = false;

    const clearPoll = () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;

      playerRef.current = new YT.Player(playerHostId, {
        videoId: TUTORIAL_VIDEO_ID,
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          rel: 0,
          controls: 1,
          autoplay: shouldPlayOnView ? 0 : 1,
          mute: 1,
          modestbranding: 0,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            if (shouldPlayOnView && !isInViewRef.current) return;
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT.PlayerState.PLAYING) {
              if (previewStoppedRef.current) {
                clearPoll();
                return;
              }
              clearPoll();
              pollRef.current = window.setInterval(() => {
                const t = event.target.getCurrentTime();
                if (t >= limit) {
                  clearPoll();
                  previewStoppedRef.current = true;
                  event.target.pauseVideo();
                  event.target.seekTo(limit, true);
                }
              }, 100);
            } else {
              clearPoll();
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearPoll();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [
    activated,
    playerHostId,
    shouldPlayOnView,
    stopAfterSeconds,
    useControlledPreview,
  ]);

  useEffect(() => {
    if (!useControlledPreview || !shouldPlayOnView) return;
    const player = playerRef.current;
    if (!player || previewStoppedRef.current) return;

    if (isInView) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [isInView, shouldPlayOnView, useControlledPreview]);

  return (
    <figure
      ref={rootRef}
      className={`tutorial-video${compact ? ' tutorial-video--compact' : ''}${shortsPlayer ? ' tutorial-video--shorts' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="tutorial-video__frame">
        {useControlledPreview ? (
          activated ? (
            <div id={playerHostId} className="tutorial-video__api-host" />
          ) : (
            <div
              className="tutorial-video__api-host tutorial-video__api-host--idle"
              aria-hidden
            />
          )
        ) : (
          <iframe
            src={TUTORIAL_VIDEO_EMBED_URL}
            title={TUTORIAL_VIDEO_TITLE}
            width={TUTORIAL_VIDEO_WIDTH}
            height={TUTORIAL_VIDEO_HEIGHT}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
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
