import {
  type CSSProperties,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { gsap } from 'gsap';

export type TextLoopShape = 'wave' | 'circle' | 'infinity' | 'arch' | 'line';
export type TextLoopDirection = 'forward' | 'reverse';

export interface TextLoopProps {
  text?: string;
  shape?: TextLoopShape;
  path?: string;
  speed?: number;
  direction?: TextLoopDirection;
  separator?: string;
  curviness?: number;
  fontSize?: number;
  fontWeight?: number | string;
  letterSpacing?: number;
  uppercase?: boolean;
  color?: string;
  ribbon?: boolean;
  ribbonColor?: string;
  ribbonWidth?: number;
  pauseOnHover?: boolean;
  /** SVG canvas height in viewBox units (default 520). Use ~140–180 for a compact banner. */
  viewHeight?: number;
  className?: string;
  style?: CSSProperties;
}

interface Metrics {
  length: number;
  reps: number;
}

const VIEW_W = 1200;
const EDGE_PAD = 6;

const buildPath = (
  shape: TextLoopShape,
  curviness: number,
  ribbonWidth: number,
  viewH: number
): string => {
  const cx = VIEW_W / 2;
  const cy = viewH / 2;
  const c = Math.max(0, curviness);
  const room = Math.max(20, cy - Math.max(0, ribbonWidth) / 2 - EDGE_PAD);

  switch (shape) {
    case 'circle': {
      const r = Math.min(90 + c * 0.95, room);
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
    }
    case 'infinity': {
      const r = 150 + c * 1.4;
      const h = Math.min(60 + c * 0.95, room);
      return [
        `M ${cx} ${cy}`,
        `C ${cx + r * 0.55} ${cy - h} ${cx + r} ${cy - h} ${cx + r} ${cy}`,
        `C ${cx + r} ${cy + h} ${cx + r * 0.55} ${cy + h} ${cx} ${cy}`,
        `C ${cx - r * 0.55} ${cy - h} ${cx - r} ${cy - h} ${cx - r} ${cy}`,
        `C ${cx - r} ${cy + h} ${cx - r * 0.55} ${cy + h} ${cx} ${cy}`,
        'Z',
      ].join(' ');
    }
    case 'arch': {
      const rise = Math.min(120 + c * 1.1, room * 2);
      return `M 120 ${cy + rise / 2} Q ${cx} ${cy - rise * 1.5} ${VIEW_W - 120} ${cy + rise / 2}`;
    }
    case 'line':
      return `M -320 ${cy} L ${VIEW_W + 320} ${cy}`;
    case 'wave':
    default: {
      const a = Math.min(c * 2.2, room * 2);
      return `M -320 ${cy} Q -160 ${cy - a} 0 ${cy} T 320 ${cy} T 640 ${cy} T 960 ${cy} T 1280 ${cy} T ${VIEW_W + 320} ${cy}`;
    }
  }
};

export default function TextLoop({
  text = 'Cosmo',
  shape = 'wave',
  path,
  speed = 90,
  direction = 'forward',
  separator = '✦',
  curviness = 90,
  fontSize = 46,
  fontWeight = 800,
  letterSpacing = 2,
  uppercase = true,
  color = '#ffffff',
  ribbon = true,
  ribbonColor = '#5227FF',
  ribbonWidth = 86,
  pauseOnHover = true,
  viewHeight = 520,
  className = '',
  style = {},
}: TextLoopProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const measureRef = useRef<SVGTextElement | null>(null);
  const headRef = useRef<SVGTextPathElement | null>(null);
  const tailRef = useRef<SVGTextPathElement | null>(null);

  const [metrics, setMetrics] = useState<Metrics>({ length: 0, reps: 1 });
  const ready = metrics.length > 0;

  const rawId = useId();
  const pathId = `text-loop-${rawId.replace(/:/g, '')}`;

  const d = useMemo(
    () => path || buildPath(shape, curviness, ribbonWidth, viewHeight),
    [path, shape, curviness, ribbonWidth, viewHeight]
  );

  const unit = useMemo(() => {
    const base = uppercase ? String(text).toUpperCase() : String(text);
    const gap = separator ? `\u00A0${separator}\u00A0` : '\u00A0\u00A0\u00A0';
    return `${base}${gap}`;
  }, [text, separator, uppercase]);

  const textStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${fontSize}px`,
      fontWeight,
      letterSpacing: `${letterSpacing}px`,
    }),
    [fontSize, fontWeight, letterSpacing]
  );

  useLayoutEffect(() => {
    const pathEl = pathRef.current;
    const measureEl = measureRef.current;
    if (!pathEl || !measureEl) return undefined;

    let cancelled = false;
    let raf = 0;

    const measure = () => {
      if (cancelled) return;
      let length = 0;
      let unitWidth = 0;
      try {
        length = pathEl.getTotalLength();
        unitWidth = measureEl.getComputedTextLength();
      } catch {
        return;
      }
      if (!length || !unitWidth) return;

      // Fill ~one path length. textLength={length} then only nudges spacing —
      // packing 2× (or even ceil+1) crushed "Naukri Auto Apply ✦" on reload.
      const reps = Math.max(2, Math.round(length / unitWidth));
      setMetrics((prev) =>
        prev.length === length && prev.reps === reps ? prev : { length, reps }
      );
    };

    const run = () => {
      measure();
      raf = requestAnimationFrame(measure);
    };

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) run();
      }).catch(run);
    } else {
      run();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [d, unit, fontSize, fontWeight, letterSpacing]);

  useLayoutEffect(() => {
    const { length } = metrics;
    const head = headRef.current;
    const tail = tailRef.current;
    if (!head || !tail || !length) return undefined;

    const apply = (offset: number) => {
      const partner = offset >= 0 ? offset - length : offset + length;
      head.setAttribute('startOffset', `${offset}`);
      tail.setAttribute('startOffset', `${partner}`);
    };

    // Set partner offset before first paint so both paths never stack at 0.
    apply(0);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || speed <= 0) return undefined;

    const state = { offset: 0 };
    const tween = gsap.to(state, {
      offset: direction === 'reverse' ? -length : length,
      duration: length / speed,
      ease: 'none',
      repeat: -1,
      onUpdate: () => apply(state.offset),
    });

    const root = rootRef.current;
    const pause = () => tween.pause();
    const resume = () => tween.resume();

    if (pauseOnHover && root) {
      root.addEventListener('pointerenter', pause);
      root.addEventListener('pointerleave', resume);
    }

    return () => {
      tween.kill();
      if (pauseOnHover && root) {
        root.removeEventListener('pointerenter', pause);
        root.removeEventListener('pointerleave', resume);
      }
    };
  }, [metrics, speed, direction, pauseOnHover]);

  const loopText = unit.repeat(metrics.reps);
  const fitLength = ready ? metrics.length : undefined;

  return (
    <div
      ref={rootRef}
      className={`text-loop${ready ? ' text-loop--ready' : ''} ${className}`.trim()}
      style={style}
    >
      <svg
        className="text-loop__svg"
        viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={text}
      >
        <path
          ref={pathRef}
          id={pathId}
          d={d}
          fill="none"
          stroke={ribbon ? ribbonColor : 'none'}
          strokeWidth={ribbon ? ribbonWidth : 0}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <text
          ref={measureRef}
          className="text-loop__measure"
          style={textStyle}
          aria-hidden="true"
        >
          {unit}
        </text>

        {ready ? (
          <>
            <text
              className="text-loop__copy"
              style={textStyle}
              fill={color}
              dominantBaseline="central"
              aria-hidden="true"
            >
              <textPath
                ref={headRef}
                href={`#${pathId}`}
                startOffset={0}
                textLength={fitLength}
                lengthAdjust="spacing"
              >
                {loopText}
              </textPath>
            </text>

            <text
              className="text-loop__copy"
              style={textStyle}
              fill={color}
              dominantBaseline="central"
              aria-hidden="true"
            >
              <textPath
                ref={tailRef}
                href={`#${pathId}`}
                startOffset={-metrics.length}
                textLength={fitLength}
                lengthAdjust="spacing"
              >
                {loopText}
              </textPath>
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
