import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export type SuccessStoriesButtonVariant = 'black' | 'white';

export interface SuccessStoriesButtonProps {
  label?: string;
  className?: string;
  variant?: SuccessStoriesButtonVariant;
  /** When false, renders a plain label without arrow morph. Defaults to true. */
  showArrow?: boolean;
  /** When set, renders a router link instead of a button/anchor. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Replaces the face content (e.g. a loader) while keeping the shell. */
  children?: ReactNode;
}

/**
 * A compact, high-contrast call-to-action with black / white invert themes.
 * Without `to` or `onClick`, the link is intentionally inert.
 */
export function SuccessStoriesButton({
  label = 'See More Success Stories',
  className = '',
  variant = 'black',
  showArrow = true,
  to,
  onClick,
  disabled = false,
  children,
}: SuccessStoriesButtonProps) {
  const classNames = [
    'success-stories-button',
    `success-stories-button--${variant}`,
    !showArrow ? 'success-stories-button--plain' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const face = children ?? (
    <span className="success-stories-button__face">
      {showArrow ? (
        <span className="success-stories-button__circle-arrow" aria-hidden="true">
          <span className="success-stories-button__circle-arrow-halo" aria-hidden="true" />
          <ArrowRight size={21} strokeWidth={2.6} />
        </span>
      ) : null}
      <span className="success-stories-button__label">{label}</span>
      {showArrow ? (
        <span className="success-stories-button__plain-arrow" aria-hidden="true">
          <ArrowRight size={25} strokeWidth={2.4} />
        </span>
      ) : null}
    </span>
  );

  if (to) {
    return (
      <Link to={to} aria-label={label} className={classNames}>
        {face}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={label}
        className={classNames}
        disabled={disabled}
        onClick={onClick}
      >
        {face}
      </button>
    );
  }

  return (
    <a
      href="#"
      aria-label={label}
      className={classNames}
      onClick={(event) => event.preventDefault()}
    >
      {face}
    </a>
  );
}
