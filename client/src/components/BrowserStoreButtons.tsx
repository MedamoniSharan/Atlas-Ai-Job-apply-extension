import * as React from 'react';

export type BrowserStoreKey = 'chrome' | 'edge' | 'firefox';

export type BrowserStoreButtonsProps = {
  className?: string;
  /** Highlight one store (defaults to chrome). */
  featured?: BrowserStoreKey;
};

const STORE_URLS: Record<BrowserStoreKey, string> = {
  chrome: import.meta.env.VITE_CHROME_EXTENSION_URL ?? '',
  edge: import.meta.env.VITE_EDGE_EXTENSION_URL ?? '',
  firefox: import.meta.env.VITE_FIREFOX_EXTENSION_URL ?? '',
};

const stores = [
  {
    key: 'chrome' as const,
    label: 'Chrome Web Store',
    title: 'Add Cosmo from the Chrome Web Store',
    storeName: 'Chrome Web Store',
    cta: 'Add to Chrome',
  },
  {
    key: 'edge' as const,
    label: 'Microsoft Edge Add-ons',
    title: 'Add Cosmo from Microsoft Edge Add-ons',
    storeName: 'Microsoft Edge',
    cta: 'Get for Edge',
  },
  {
    key: 'firefox' as const,
    label: 'Firefox Add-ons',
    title: 'Add Cosmo from Firefox Add-ons',
    storeName: 'Firefox Add-ons',
    cta: 'Get for Firefox',
  },
];

function StoreMark({
  storeKey,
  size = 31,
}: {
  storeKey: BrowserStoreKey;
  size?: number;
}) {
  if (storeKey === 'chrome') {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 190.5 190.5"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="#fff"
          d="M95.252 142.873c26.304 0 47.627-21.324 47.627-47.628s-21.323-47.628-47.627-47.628-47.627 21.324-47.627 47.628 21.323 47.628 47.627 47.628z"
        />
        <path
          fill="#229342"
          d="m54.005 119.07-41.24-71.43a95.227 95.227 0 0 0-.003 95.25 95.234 95.234 0 0 0 82.496 47.61l41.24-71.43v-.011a47.613 47.613 0 0 1-17.428 17.443 47.62 47.62 0 0 1-47.632.007 47.62 47.62 0 0 1-17.433-17.437z"
        />
        <path
          fill="#fbc116"
          d="m136.495 119.067-41.239 71.43a95.229 95.229 0 0 0 82.489-47.622A95.24 95.24 0 0 0 190.5 95.248a95.237 95.237 0 0 0-12.772-47.623H95.249l-.01.007a47.62 47.62 0 0 1 23.819 6.372 47.618 47.618 0 0 1 17.439 17.431 47.62 47.62 0 0 1-.001 47.633z"
        />
        <path
          fill="#1a73e8"
          d="M95.252 132.961c20.824 0 37.705-16.881 37.705-37.706S116.076 57.55 95.252 57.55 57.547 74.431 57.547 95.255s16.881 37.706 37.705 37.706z"
        />
        <path
          fill="#e33b2e"
          d="M95.252 47.628h82.479A95.237 95.237 0 0 0 142.87 12.76 95.23 95.23 0 0 0 95.245 0a95.222 95.222 0 0 0-47.623 12.767 95.23 95.23 0 0 0-34.856 34.872l41.24 71.43.011.006a47.62 47.62 0 0 1-.015-47.633 47.61 47.61 0 0 1 41.252-23.815z"
        />
      </svg>
    );
  }

  if (storeKey === 'edge') {
    const uid = React.useId().replace(/:/g, '');
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={`${uid}-a`}
            x1="63.3"
            x2="241.7"
            y1="84"
            y2="84"
            gradientTransform="matrix(1 0 0 -1 0 266)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0c59a4" />
            <stop offset="1" stopColor="#114a8b" />
          </linearGradient>
          <linearGradient
            id={`${uid}-c`}
            x1="157.3"
            x2="46"
            y1="161.4"
            y2="40.1"
            gradientTransform="matrix(1 0 0 -1 0 266)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#1b9de2" />
            <stop offset="1" stopColor="#0078d4" />
          </linearGradient>
          <radialGradient
            id={`${uid}-e`}
            cx="113.4"
            cy="570.2"
            r="202.4"
            gradientTransform="matrix(-.04 1 2.13 .08 -1179.5 -106.7)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#35c1f1" />
            <stop offset=".7" stopColor="#36c752" />
          </radialGradient>
        </defs>
        <g transform="translate(-4.6 -5)">
          <path
            fill={`url(#${uid}-a)`}
            d="M235.7 195.5a93.7 93.7 0 0 1-10.6 4.7 101.9 101.9 0 0 1-35.9 6.4c-47.3 0-88.5-32.5-88.5-74.3a31.5 31.5 0 0 1 16.4-27.3c-42.8 1.8-53.8 46.4-53.8 72.5 0 74 68.1 81.4 82.8 81.4 7.9 0 19.8-2.3 27-4.6l1.3-.4a128.3 128.3 0 0 0 66.6-52.8 4 4 0 0 0-5.3-5.6Z"
          />
          <path
            fill={`url(#${uid}-c)`}
            d="M110.3 246.3A79.2 79.2 0 0 1 87.6 225a80.7 80.7 0 0 1 29.5-120c3.2-1.5 8.5-4.1 15.6-4a32.4 32.4 0 0 1 25.7 13 31.9 31.9 0 0 1 6.3 18.7c0-.2 24.5-79.6-80-79.6-43.9 0-80 41.6-80 78.2a130.2 130.2 0 0 0 12.1 56 128 128 0 0 0 156.4 67 75.5 75.5 0 0 1-62.8-8Z"
          />
          <path
            fill={`url(#${uid}-e)`}
            d="M157 153.8c-.9 1-3.4 2.5-3.4 5.6 0 2.6 1.7 5.2 4.8 7.3 14.3 10 41.4 8.6 41.5 8.6a59.6 59.6 0 0 0 30.3-8.3 61.4 61.4 0 0 0 30.4-52.9c.3-22.4-8-37.3-11.3-43.9C228 28.8 182.3 5 132.6 5a128 128 0 0 0-128 126.2c.5-36.5 36.8-66 80-66 3.5 0 23.5.3 42 10a72.6 72.6 0 0 1 30.9 29.3c6.1 10.6 7.2 24.1 7.2 29.5s-2.7 13.3-7.8 19.9Z"
          />
        </g>
      </svg>
    );
  }

  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 256 265"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={`${uid}-a`}
          x1="70.786"
          x2="6.447"
          y1="12.393"
          y2="74.468"
          gradientTransform="translate(-2.999 -.01) scale(3.3067)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".048" stopColor="#fff44f" />
          <stop offset=".401" stopColor="#ff8b16" />
          <stop offset=".705" stopColor="#e31587" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${uid}-a)`}
        d="M248.033 88.713c-5.569-13.399-16.864-27.866-25.71-32.439a133.169 133.169 0 0 1 12.979 38.9l.023.215c-14.49-36.126-39.062-50.692-59.13-82.41a155.1 155.1 0 0 1-3.019-4.907 40.605 40.605 0 0 1-1.412-2.645 23.31 23.31 0 0 1-1.912-5.076.331.331 0 0 0-.291-.331.469.469 0 0 0-.241 0c-.016 0-.043.03-.063.037-.02.006-.063.036-.092.049l.049-.086c-32.19 18.849-43.113 53.741-44.118 71.194a64.108 64.108 0 0 0-35.269 13.593 38.336 38.336 0 0 0-3.307-2.506 59.417 59.417 0 0 1-.36-31.324 94.912 94.912 0 0 0-30.848 23.841h-.06c-5.079-6.438-4.722-27.667-4.431-32.102a22.957 22.957 0 0 0-4.279 2.272 93.435 93.435 0 0 0-12.526 10.73 111.954 111.954 0 0 0-11.98 14.375v.019-.023A108.26 108.26 0 0 0 4.841 108.92l-.171.846a203.818 203.818 0 0 0-1.26 8.003c0 .096-.02.185-.03.281a122.12 122.12 0 0 0-2.08 17.667v.662c.086 98.661 106.944 160.23 192.344 110.825a128.165 128.165 0 0 0 62.12-89.153c.215-1.653.39-3.29.582-4.96a131.8 131.8 0 0 0-8.313-64.378Z"
      />
    </svg>
  );
}

/** Official browser brand mark (Chrome / Edge / Firefox). */
export function BrowserStoreMark({
  storeKey,
  size = 22,
}: {
  storeKey: BrowserStoreKey;
  size?: number;
}) {
  return <StoreMark storeKey={storeKey} size={size} />;
}

export function BrowserStoreButtons({
  className = '',
  featured = 'chrome',
}: BrowserStoreButtonsProps) {
  return (
    <nav
      aria-label="Browser extension stores"
      className={`browser-store-buttons ${className}`.trim()}
    >
      {stores.map((store) => {
        const href = STORE_URLS[store.key];
        const isFeatured = store.key === featured;
        return (
          <a
            key={store.key}
            href={href || undefined}
            target={href ? '_blank' : undefined}
            rel={href ? 'noreferrer noopener' : undefined}
            aria-label={store.title}
            aria-disabled={!href}
            className={`browser-store-button${isFeatured ? ' is-featured' : ''}${!href ? ' is-disabled' : ''}`}
            onClick={(event) => {
              if (href) return;
              event.preventDefault();
              window.alert(
                `${store.storeName} listing is coming soon. For Chrome, use Add to Chrome when the store link is available.`
              );
            }}
          >
            <StoreMark storeKey={store.key} />
            <span className="browser-store-button__text">
              <span className="sr-only">{store.label}</span>
              <span className="browser-store-button__eyebrow">
                {href ? 'Available in the' : 'Coming soon on'}
              </span>
              <span className="browser-store-button__name">{store.storeName}</span>
              <span className="browser-store-button__cta">{store.cta}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}
