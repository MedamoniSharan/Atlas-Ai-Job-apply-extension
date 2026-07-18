const CHROME_STORE_URL = import.meta.env.VITE_CHROME_EXTENSION_URL ?? '';

const DEV_STEPS = [
  'Open chrome://extensions in Chrome',
  'Enable Developer mode (top right)',
  'Click Load unpacked and select the extension/dist folder',
  'Pin Atlas from the extensions toolbar',
];

export function ExtensionOnboarding({
  compact = false,
  userEmail,
}: {
  compact?: boolean;
  userEmail?: string;
}) {
  const installHref = CHROME_STORE_URL || 'https://www.google.com/chrome/';

  return (
    <section className={`onboarding ${compact ? 'onboarding--compact' : ''}`}>
      <div className="onboarding__header">
        <p className="onboarding__eyebrow">Next step</p>
        <h3>Install the Atlas Chrome extension</h3>
        <p className="muted">
          Your dashboard stays empty until the extension is installed and signed
          in with the same account{userEmail ? ` (${userEmail})` : ''}.
        </p>
      </div>

      <ol className="onboarding__steps">
        <li className="onboarding__step onboarding__step--done">
          <span className="onboarding__step-num">1</span>
          <div>
            <strong>Account created</strong>
            <p className="muted">You&apos;re signed in to Atlas.</p>
          </div>
        </li>
        <li className="onboarding__step onboarding__step--active">
          <span className="onboarding__step-num">2</span>
          <div>
            <strong>Install extension</strong>
            {CHROME_STORE_URL ? (
              <p className="muted">Add Atlas from the Chrome Web Store.</p>
            ) : (
              <ul className="onboarding__substeps">
                {DEV_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
        <li className="onboarding__step">
          <span className="onboarding__step-num">3</span>
          <div>
            <strong>Sign in on extension</strong>
            <p className="muted">
              Open the Atlas popup → use the same email and password → API base
              URL: <code>http://localhost:4000</code>
            </p>
          </div>
        </li>
        <li className="onboarding__step">
          <span className="onboarding__step-num">4</span>
          <div>
            <strong>Browse Naukri</strong>
            <p className="muted">
              Visit a job page while logged into Naukri. Applications appear
              here automatically.
            </p>
          </div>
        </li>
      </ol>

      <div className="onboarding__actions">
        <a
          className="primary-btn"
          href={installHref}
          target="_blank"
          rel="noreferrer"
        >
          {CHROME_STORE_URL ? 'Install from Chrome Web Store' : 'Get Chrome'}
        </a>
        {!CHROME_STORE_URL && (
          <p className="onboarding__hint muted">
            After loading unpacked, this page updates automatically once the
            extension signs in.
          </p>
        )}
      </div>
    </section>
  );
}
