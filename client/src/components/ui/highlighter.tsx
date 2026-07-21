import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useInView } from 'motion/react';
import { annotate } from 'rough-notation';
import type { RoughAnnotation } from 'rough-notation/lib/model';

type AnnotationAction =
  | 'highlight'
  | 'underline'
  | 'box'
  | 'circle'
  | 'strike-through'
  | 'crossed-off'
  | 'bracket';

type HighlighterProps = {
  children: ReactNode;
  action?: AnnotationAction;
  color?: string;
  strokeWidth?: number;
  animationDuration?: number;
  iterations?: number;
  padding?: number;
  multiline?: boolean;
  isView?: boolean;
};

export function Highlighter({
  children,
  action = 'highlight',
  color = '#ffd1dc',
  strokeWidth = 1.5,
  animationDuration = 600,
  iterations = 2,
  padding = 2,
  multiline = true,
  isView = false,
}: HighlighterProps) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const annotationRef = useRef<RoughAnnotation | null>(null);
  const isInViewRef = useRef(false);

  const isInView = useInView(elementRef, {
    once: false,
    amount: 0.55,
    margin: '0px 0px -10% 0px',
  });

  isInViewRef.current = isInView;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const annotation = annotate(element, {
      type: action,
      color,
      strokeWidth,
      animationDuration,
      iterations,
      padding,
      multiline,
    });
    annotationRef.current = annotation;

    const visible = !isView || isInViewRef.current;
    if (visible) {
      annotation.show();
    }

    return () => {
      annotation.remove();
      annotationRef.current = null;
    };
  }, [
    action,
    color,
    strokeWidth,
    animationDuration,
    iterations,
    padding,
    multiline,
    isView,
  ]);

  useEffect(() => {
    if (!isView) return;
    const annotation = annotationRef.current;
    if (!annotation) return;

    if (isInView) {
      annotation.hide();
      // Restart draw when scrolling back into view
      requestAnimationFrame(() => {
        annotationRef.current?.show();
      });
    } else {
      annotation.hide();
    }
  }, [isInView, isView]);

  return (
    <span ref={elementRef} className="text-highlighter">
      {children}
    </span>
  );
}
