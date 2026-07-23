import React, {
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from 'react';
import { Link } from 'react-router-dom';

export type ShimmerButtonProps = {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
  to?: string;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children'>;

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(function ShimmerButton(
  {
    shimmerColor = '#ffffff',
    shimmerSize = '0.05em',
    shimmerDuration = '3s',
    borderRadius = '100px',
    background = '#15362b',
    className,
    children,
    to,
    type = 'button',
    ...props
  },
  ref
) {
  const style = {
    '--spread': '90deg',
    '--shimmer-color': shimmerColor,
    '--radius': borderRadius,
    '--speed': shimmerDuration,
    '--cut': shimmerSize,
    '--bg': background,
  } as CSSProperties;

  const classes = `shimmer-button${className ? ` ${className}` : ''}`;

  const inner = (
    <>
      <span className="shimmer-button__spark" aria-hidden>
        <span className="shimmer-button__spark-slide">
          <span className="shimmer-button__spark-spin" />
        </span>
      </span>
      <span className="shimmer-button__label">{children}</span>
      <span className="shimmer-button__highlight" aria-hidden />
      <span className="shimmer-button__backdrop" aria-hidden />
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} style={style} {...props}>
      {inner}
    </button>
  );
});

ShimmerButton.displayName = 'ShimmerButton';
