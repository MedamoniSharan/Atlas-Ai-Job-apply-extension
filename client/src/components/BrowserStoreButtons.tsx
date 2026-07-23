import * as React from 'react';

export type BrowserStoreButtonsProps = {
  className?: string;
};

const stores = [
  {
    key: 'chrome',
    label: 'Chrome Web Store',
    title: 'Get it from the Chrome Web Store',
    storeName: 'Chrome Web Store',
  },
  {
    key: 'edge',
    label: 'Microsoft Edge Add-ons',
    title: 'Get it from Microsoft Edge Add-ons',
    storeName: 'Microsoft Edge',
  },
  {
    key: 'firefox',
    label: 'Firefox Add-ons',
    title: 'Get it from Firefox Add-ons',
    storeName: 'Firefox Add-ons',
  },
] as const;

function ChromeMark() {
  return (
    <svg
      aria-hidden="true"
      width="31"
      height="31"
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

function EdgeMark() {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden="true"
      width="32"
      height="32"
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
        <radialGradient
          id={`${uid}-b`}
          cx="161.8"
          cy="68.9"
          r="95.4"
          gradientTransform="matrix(1 0 0 -.95 0 248.8)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".7" stopOpacity="0" />
          <stop offset=".9" stopOpacity=".5" />
          <stop offset="1" />
        </radialGradient>
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
          <stop offset=".2" stopColor="#1595df" />
          <stop offset=".7" stopColor="#0680d7" />
          <stop offset="1" stopColor="#0078d4" />
        </linearGradient>
        <radialGradient
          id={`${uid}-d`}
          cx="-340.3"
          cy="63"
          r="143.2"
          gradientTransform="matrix(.15 -.99 -.8 -.12 176.6 -125.4)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".8" stopOpacity="0" />
          <stop offset=".9" stopOpacity=".5" />
          <stop offset="1" />
        </radialGradient>
        <radialGradient
          id={`${uid}-e`}
          cx="113.4"
          cy="570.2"
          r="202.4"
          gradientTransform="matrix(-.04 1 2.13 .08 -1179.5 -106.7)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#35c1f1" />
          <stop offset=".1" stopColor="#34c1ed" />
          <stop offset=".2" stopColor="#2fc2df" />
          <stop offset=".3" stopColor="#2bc3d2" />
          <stop offset=".7" stopColor="#36c752" />
        </radialGradient>
        <radialGradient
          id={`${uid}-f`}
          cx="376.5"
          cy="568"
          r="97.3"
          gradientTransform="matrix(.28 .96 .78 -.23 -303.8 -148.5)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#66eb6e" />
          <stop offset="1" stopColor="#66eb6e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="translate(-4.6 -5)">
        <path
          fill={`url(#${uid}-a)`}
          d="M235.7 195.5a93.7 93.7 0 0 1-10.6 4.7 101.9 101.9 0 0 1-35.9 6.4c-47.3 0-88.5-32.5-88.5-74.3a31.5 31.5 0 0 1 16.4-27.3c-42.8 1.8-53.8 46.4-53.8 72.5 0 74 68.1 81.4 82.8 81.4 7.9 0 19.8-2.3 27-4.6l1.3-.4a128.3 128.3 0 0 0 66.6-52.8 4 4 0 0 0-5.3-5.6Z"
        />
        <path
          fill={`url(#${uid}-b)`}
          opacity=".35"
          d="M235.7 195.5a93.7 93.7 0 0 1-10.6 4.7 101.9 101.9 0 0 1-35.9 6.4c-47.3 0-88.5-32.5-88.5-74.3a31.5 31.5 0 0 1 16.4-27.3c-42.8 1.8-53.8 46.4-53.8 72.5 0 74 68.1 81.4 82.8 81.4 7.9 0 19.8-2.3 27-4.6l1.3-.4a128.3 128.3 0 0 0 66.6-52.8 4 4 0 0 0-5.3-5.6Z"
        />
        <path
          fill={`url(#${uid}-c)`}
          d="M110.3 246.3A79.2 79.2 0 0 1 87.6 225a80.7 80.7 0 0 1 29.5-120c3.2-1.5 8.5-4.1 15.6-4a32.4 32.4 0 0 1 25.7 13 31.9 31.9 0 0 1 6.3 18.7c0-.2 24.5-79.6-80-79.6-43.9 0-80 41.6-80 78.2a130.2 130.2 0 0 0 12.1 56 128 128 0 0 0 156.4 67 75.5 75.5 0 0 1-62.8-8Z"
        />
        <path
          fill={`url(#${uid}-d)`}
          opacity=".41"
          d="M110.3 246.3A79.2 79.2 0 0 1 87.6 225a80.7 80.7 0 0 1 29.5-120c3.2-1.5 8.5-4.1 15.6-4a32.4 32.4 0 0 1 25.7 13 31.9 31.9 0 0 1 6.3 18.7c0-.2 24.5-79.6-80-79.6-43.9 0-80 41.6-80 78.2a130.2 130.2 0 0 0 12.1 56 128 128 0 0 0 156.4 67 75.5 75.5 0 0 1-62.8-8Z"
        />
        <path
          fill={`url(#${uid}-e)`}
          d="M157 153.8c-.9 1-3.4 2.5-3.4 5.6 0 2.6 1.7 5.2 4.8 7.3 14.3 10 41.4 8.6 41.5 8.6a59.6 59.6 0 0 0 30.3-8.3 61.4 61.4 0 0 0 30.4-52.9c.3-22.4-8-37.3-11.3-43.9C228 28.8 182.3 5 132.6 5a128 128 0 0 0-128 126.2c.5-36.5 36.8-66 80-66 3.5 0 23.5.3 42 10a72.6 72.6 0 0 1 30.9 29.3c6.1 10.6 7.2 24.1 7.2 29.5s-2.7 13.3-7.8 19.9Z"
        />
        <path
          fill={`url(#${uid}-f)`}
          d="M157 153.8c-.9 1-3.4 2.5-3.4 5.6 0 2.6 1.7 5.2 4.8 7.3 14.3 10 41.4 8.6 41.5 8.6a59.6 59.6 0 0 0 30.3-8.3 61.4 61.4 0 0 0 30.4-52.9c.3-22.4-8-37.3-11.3-43.9C228 28.8 182.3 5 132.6 5a128 128 0 0 0-128 126.2c.5-36.5 36.8-66 80-66 3.5 0 23.5.3 42 10a72.6 72.6 0 0 1 30.9 29.3c6.1 10.6 7.2 24.1 7.2 29.5s-2.7 13.3-7.8 19.9Z"
        />
      </g>
    </svg>
  );
}

function FirefoxMark() {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden="true"
      width="32"
      height="32"
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
          <stop offset=".111" stopColor="#ffe847" />
          <stop offset=".225" stopColor="#ffc830" />
          <stop offset=".368" stopColor="#ff980e" />
          <stop offset=".401" stopColor="#ff8b16" />
          <stop offset=".462" stopColor="#ff672a" />
          <stop offset=".534" stopColor="#ff3647" />
          <stop offset=".705" stopColor="#e31587" />
        </linearGradient>
        <radialGradient
          id={`${uid}-b`}
          cx="-7907.187"
          cy="-8515.121"
          r="80.797"
          gradientTransform="translate(26367.938 28186.305) scale(3.3067)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".129" stopColor="#ffbd4f" />
          <stop offset=".186" stopColor="#ffac31" />
          <stop offset=".247" stopColor="#ff9d17" />
          <stop offset=".283" stopColor="#ff980e" />
          <stop offset=".403" stopColor="#ff563b" />
          <stop offset=".467" stopColor="#ff3750" />
          <stop offset=".71" stopColor="#f5156c" />
          <stop offset=".782" stopColor="#eb0878" />
          <stop offset=".86" stopColor="#e50080" />
        </radialGradient>
        <radialGradient
          id={`${uid}-h`}
          cx="-7915.977"
          cy="-8535.981"
          r="118.081"
          gradientTransform="translate(26367.938 28186.305) scale(3.3067)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".113" stopColor="#fff44f" />
          <stop offset=".456" stopColor="#ff980e" />
          <stop offset=".622" stopColor="#ff5634" />
          <stop offset=".716" stopColor="#ff3647" />
          <stop offset=".904" stopColor="#e31587" />
        </radialGradient>
        <radialGradient
          id={`${uid}-e`}
          cx="-7945.648"
          cy="-8460.984"
          r="38.471"
          gradientTransform="translate(26367.938 28186.305) scale(3.3067)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".353" stopColor="#3a8ee6" />
          <stop offset=".472" stopColor="#5c79f0" />
          <stop offset=".669" stopColor="#9059ff" />
          <stop offset="1" stopColor="#c139e6" />
        </radialGradient>
      </defs>
      <path
        fill={`url(#${uid}-a)`}
        d="M248.033 88.713c-5.569-13.399-16.864-27.866-25.71-32.439a133.169 133.169 0 0 1 12.979 38.9l.023.215c-14.49-36.126-39.062-50.692-59.13-82.41a155.1 155.1 0 0 1-3.019-4.907 40.605 40.605 0 0 1-1.412-2.645 23.31 23.31 0 0 1-1.912-5.076.331.331 0 0 0-.291-.331.469.469 0 0 0-.241 0c-.016 0-.043.03-.063.037-.02.006-.063.036-.092.049l.049-.086c-32.19 18.849-43.113 53.741-44.118 71.194a64.108 64.108 0 0 0-35.269 13.593 38.336 38.336 0 0 0-3.307-2.506 59.417 59.417 0 0 1-.36-31.324 94.912 94.912 0 0 0-30.848 23.841h-.06c-5.079-6.438-4.722-27.667-4.431-32.102a22.957 22.957 0 0 0-4.279 2.272 93.435 93.435 0 0 0-12.526 10.73 111.954 111.954 0 0 0-11.98 14.375v.019-.023A108.26 108.26 0 0 0 4.841 108.92l-.171.846a203.818 203.818 0 0 0-1.26 8.003c0 .096-.02.185-.03.281a122.12 122.12 0 0 0-2.08 17.667v.662c.086 98.661 106.944 160.23 192.344 110.825a128.165 128.165 0 0 0 62.12-89.153c.215-1.653.39-3.29.582-4.96a131.8 131.8 0 0 0-8.313-64.378Z"
      />
      <path
        fill={`url(#${uid}-b)`}
        d="M248.033 88.713c-5.569-13.399-16.864-27.866-25.71-32.439a133.169 133.169 0 0 1 12.979 38.9v.122l.023.136a116.067 116.067 0 0 1-3.988 86.497c-14.688 31.516-50.242 63.819-105.894 62.248-60.132-1.703-113.089-46.323-122.989-104.766-1.802-9.216 0-13.888.906-21.378a95.444 95.444 0 0 0-2.06 17.684v.662c.086 98.661 106.944 160.23 192.344 110.825a128.165 128.165 0 0 0 62.12-89.153c.215-1.653.39-3.29.582-4.96a131.8 131.8 0 0 0-8.313-64.378Z"
      />
      <path
        fill={`url(#${uid}-h)`}
        d="M2.471 139.411c9.89 58.443 62.857 103.063 122.989 104.766 55.652 1.574 91.205-30.732 105.894-62.248a116.067 116.067 0 0 0 3.988-86.497v-.122c0-.096-.02-.153 0-.123l.023.215c4.547 29.684-10.552 58.443-34.155 77.889l-.073.166c-45.989 37.455-90.002 22.598-98.91 16.533a64.67 64.67 0 0 1-1.865-.929c-26.814-12.817-37.891-37.247-35.517-58.198a32.912 32.912 0 0 1-30.359-19.096 48.336 48.336 0 0 1 47.117-1.891 63.821 63.821 0 0 0 48.119 1.891c-.049-1.042-22.353-9.92-31.05-18.484-4.646-4.58-6.851-6.786-8.805-8.442a38.145 38.145 0 0 0-3.307-2.507c-.761-.519-1.617-1.081-2.645-1.756-9.348-6.078-27.939-5.744-28.554-5.727h-.059c-5.079-6.438-4.722-27.667-4.431-32.101a22.862 22.862 0 0 0-4.279 2.271 93.373 93.373 0 0 0-12.526 10.73 112.062 112.062 0 0 0-12.03 14.342v.019-.023A108.26 108.26 0 0 0 4.841 108.92c-.062.261-4.616 20.167-2.37 30.491Z"
      />
      <path
        fill={`url(#${uid}-e)`}
        d="M129.683 111.734c-.212 3.188-11.475 14.182-15.413 14.182-36.443 0-42.359 22.046-42.359 22.046 1.614 18.564 14.55 33.854 30.187 41.942.714.371 1.439.705 2.163 1.032a70.572 70.572 0 0 0 3.763 1.541 56.974 56.974 0 0 0 16.675 3.217c63.876 2.996 76.25-76.384 30.154-99.419a44.241 44.241 0 0 1 30.901 7.503A64.68 64.68 0 0 0 129.6 70.985c-1.521 0-3.009.126-4.504.229a64.108 64.108 0 0 0-35.269 13.593c1.954 1.654 4.16 3.863 8.806 8.442 8.696 8.568 31 17.443 31.05 18.485Z"
      />
    </svg>
  );
}

function StoreMark({ storeKey }: { storeKey: (typeof stores)[number]['key'] }) {
  if (storeKey === 'chrome') return <ChromeMark />;
  if (storeKey === 'edge') return <EdgeMark />;
  return <FirefoxMark />;
}

export function BrowserStoreButtons({
  className = '',
}: BrowserStoreButtonsProps) {
  return (
    <nav
      aria-label="Browser extension stores"
      className={`browser-store-buttons ${className}`.trim()}
    >
      {stores.map((store) => (
        <a
          key={store.key}
          href=""
          onClick={(event) => event.preventDefault()}
          aria-label={store.title}
          className="browser-store-button"
        >
          <StoreMark storeKey={store.key} />
          <span className="browser-store-button__text">
            <span className="sr-only">{store.label}</span>
            <span className="browser-store-button__eyebrow">Available in the</span>
            <span className="browser-store-button__name">{store.storeName}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}
