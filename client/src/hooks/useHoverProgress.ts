import { useCallback, useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * On hover, animates a percentage from 0 → target with smooth easing.
 * Register a `replay` callback to reset CSS stroke transitions in sync.
 */
export function useHoverProgress(target: number, durationMs = 1200) {
  const clamped = Math.max(0, Math.min(100, target));
  const [display, setDisplay] = useState(clamped);
  const [hovered, setHovered] = useState(false);
  const onReplayRef = useRef<(() => void) | null>(null);

  const setReplay = useCallback((fn: (() => void) | null) => {
    onReplayRef.current = fn;
  }, []);

  useEffect(() => {
    if (!hovered) {
      setDisplay(clamped);
      return;
    }

    if (prefersReducedMotion() || clamped <= 0) {
      setDisplay(clamped);
      onReplayRef.current?.();
      return;
    }

    let raf = 0;
    let cancelled = false;
    setDisplay(0);
    onReplayRef.current?.();

    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame((start) => {
        const tick = (now: number) => {
          if (cancelled) return;
          const t = Math.min(1, (now - start) / durationMs);
          setDisplay(clamped * easeInOutCubic(t));
          if (t < 1) {
            raf = requestAnimationFrame(tick);
          } else {
            setDisplay(clamped);
          }
        };
        raf = requestAnimationFrame(tick);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [hovered, clamped, durationMs]);

  return {
    value: display,
    percent: Math.round(display),
    durationMs,
    hovered,
    setReplay,
    bind: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setHovered(true),
      onBlur: () => setHovered(false),
    },
  };
}
