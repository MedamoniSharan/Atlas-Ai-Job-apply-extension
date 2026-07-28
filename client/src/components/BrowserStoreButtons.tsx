import {
  CHROME_EXTENSION_ZIP_FILENAME,
  CHROME_EXTENSION_ZIP_URL,
} from '../lib/chromeExtension';

export type BrowserStoreKey = 'chrome' | 'edge' | 'firefox';

export type BrowserStoreButtonsProps = {
  className?: string;
  /** Highlight one store (defaults to chrome). */
  featured?: BrowserStoreKey;
};

const STORE_URLS: Record<BrowserStoreKey, string> = {
  chrome: CHROME_EXTENSION_ZIP_URL,
  edge: import.meta.env.VITE_EDGE_EXTENSION_URL ?? '',
  firefox: import.meta.env.VITE_FIREFOX_EXTENSION_URL ?? '',
};

const STORE_LOGOS: Record<BrowserStoreKey, string> = {
  chrome: '/browser-logos/chrome.svg',
  edge: '/browser-logos/edge.svg',
  firefox: '/browser-logos/firefox.svg',
};

const stores = [
  {
    key: 'chrome' as const,
    label: 'Chrome extension zip',
    title: 'Download the Cosmo Chrome extension zip',
    storeName: 'Chrome',
    cta: 'Download zip',
    download: CHROME_EXTENSION_ZIP_FILENAME,
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
  return (
    <img
      className="browser-store-mark"
      src={STORE_LOGOS[storeKey]}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
    />
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
      aria-label="Browser extension installs"
      className={`browser-store-buttons ${className}`.trim()}
    >
      {stores.map((store) => {
        const href = STORE_URLS[store.key];
        const isFeatured = store.key === featured;
        const isDownload = Boolean(store.download);
        return (
          <a
            key={store.key}
            href={href || undefined}
            download={store.download}
            target={!isDownload && href ? '_blank' : undefined}
            rel={!isDownload && href ? 'noreferrer noopener' : undefined}
            aria-label={store.title}
            className={`browser-store-button${isFeatured ? ' is-featured' : ''}`}
            onClick={(event) => {
              if (href) return;
              event.preventDefault();
              window.alert(
                `${store.storeName} listing will open here once the store link is available.`
              );
            }}
          >
            <StoreMark storeKey={store.key} />
            <span className="browser-store-button__text">
              <span className="sr-only">{store.label}</span>
              <span className="browser-store-button__name">{store.storeName}</span>
              <span className="browser-store-button__cta">{store.cta}</span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}
