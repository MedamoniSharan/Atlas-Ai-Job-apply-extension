import { BrowserStoreMark } from '../BrowserStoreButtons';

export type StatusIconKey =
  | 'applied'
  | 'matched'
  | 'company'
  | 'skipped'
  | 'auto'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'connect';

/** Soft flat status marks for the jobs / extension breakdown table. */
export function FlatStatusIcon({
  icon,
  size = 18,
}: {
  icon: StatusIconKey;
  size?: number;
}) {
  if (icon === 'chrome' || icon === 'edge' || icon === 'firefox') {
    return <BrowserStoreMark storeKey={icon} size={size + 4} />;
  }

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true as const,
  };

  switch (icon) {
    case 'applied':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="#2f6b52" />
          <path
            d="M7.5 12.2 10.4 15l6.1-6.4"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'matched':
      return (
        <svg {...common}>
          <path
            d="M12 3.2 13.7 8.4l5.3.4-4.1 3.4 1.3 5.2L12 14.7 7.8 17.4l1.3-5.2-4.1-3.4 5.3-.4L12 3.2Z"
            fill="#0b7ea4"
          />
          <circle cx="18.6" cy="5.2" r="1.6" fill="#7ec8dc" />
        </svg>
      );
    case 'company':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="#3b6fd9" />
          <ellipse
            cx="12"
            cy="12"
            rx="4.2"
            ry="10"
            stroke="#fff"
            strokeWidth="1.6"
            fill="none"
          />
          <path
            d="M2.8 12h18.4M4.2 7.5h15.6M4.2 16.5h15.6"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'skipped':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#e08a2b" />
          <path d="M7 7.5v9l7-4.5-7-4.5Z" fill="#fff" />
          <path
            d="M15.6 7.5v9"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'auto':
      return (
        <svg {...common}>
          <path
            d="M9.2 3.5h5.1c.5 0 .9.3 1.1.7l1.4 3.2c.1.3.4.5.7.5h2c1.1 0 1.8 1.2 1.3 2.2l-2.2 4.2c-.2.4-.6.6-1 .6H14l-1.2 4.4c-.3 1-1.7 1.1-2.1.1L9.4 14H6.5c-.5 0-.9-.3-1.1-.7L4 10c-.3-1 .4-2 1.4-2h2.2c.3 0 .6-.2.7-.5l1-3.3c.1-.4.5-.7 1-.7Z"
            fill="#15362b"
          />
          <circle cx="10.2" cy="10.2" r="1.5" fill="#8fbfa8" />
        </svg>
      );
    case 'connect':
    default:
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2.5" fill="#15362b" />
          <path
            d="M8 7V5.8A2.8 2.8 0 0 1 10.8 3h2.4A2.8 2.8 0 0 1 16 5.8V7"
            stroke="#15362b"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M3 12.5h18"
            stroke="#8fbfa8"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
