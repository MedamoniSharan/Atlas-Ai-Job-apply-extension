const MARK_PATH =
  'M12 8.145c1.715 0 3.107-1.375 3.107-3.072S13.717 2 12 2 8.893 3.375 8.893 5.072 10.283 8.145 12 8.145M12 22c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073-3.107 1.376-3.107 3.073S10.283 22 12 22M6.004 11.646c1.716 0 3.107-1.375 3.107-3.072S7.721 5.5 6.004 5.5 2.897 6.877 2.897 8.575s1.39 3.072 3.107 3.072M17.996 18.492c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073-3.107 1.376-3.107 3.073 1.39 3.072 3.107 3.072M17.996 11.646c1.715 0 3.107-1.374 3.107-3.072s-1.39-3.072-3.107-3.072-3.107 1.374-3.107 3.072 1.39 3.072 3.107 3.072M6.004 18.492c1.716 0 3.107-1.375 3.107-3.073s-1.39-3.072-3.107-3.072-3.107 1.378-3.107 3.074 1.39 3.072 3.107 3.072z';

type CosmosLogoProps = {
  className?: string;
  size?: number;
  label?: string;
};

export function CosmosLogo({
  className = '',
  size = 24,
  label = 'Cosmo',
}: CosmosLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      fill="none"
    >
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}

export function CosmosIconMark({
  size = 48,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <CosmosLogo
      className={className}
      size={size}
      label="Cosmo mark"
    />
  );
}

/** Large footer wordmark — company name */
export function CosmovaiWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`cosmovai-wordmark ${className}`.trim()} aria-label="cosmovai">
      cosmovai
    </span>
  );
}

type CosmosMarkProps = {
  className?: string;
  word?: string;
  logoSize?: number;
};

export function CosmosMark({
  className = '',
  word = 'cosmo',
  logoSize = 24,
}: CosmosMarkProps) {
  return (
    <span className={`cosmos-mark ${className}`.trim()}>
      <CosmosLogo className="cosmos-mark__logo" size={logoSize} />
      <span className="cosmos-mark__word">{word}</span>
    </span>
  );
}

type CosmosLoaderProps = {
  label?: string;
  size?: number;
  className?: string;
};

export function CosmosLoader({
  label = 'Loading…',
  size = 36,
  className = '',
}: CosmosLoaderProps) {
  return (
    <div
      className={`cosmos-loader ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <CosmosLogo className="cosmos-loader__logo" size={size} label={label} />
      {label ? <p className="cosmos-loader__label">{label}</p> : null}
    </div>
  );
}

export { MARK_PATH };
