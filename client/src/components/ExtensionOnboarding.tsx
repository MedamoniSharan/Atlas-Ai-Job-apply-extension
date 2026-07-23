import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { BrowserStoreButtons } from './BrowserStoreButtons';
import { ONBOARDING_QUERY_KEY } from '../lib/onboarding';

export function ExtensionOnboarding({
  compact = false,
  userEmail,
}: {
  compact?: boolean;
  userEmail?: string;
}) {
  const queryClient = useQueryClient();

  async function refreshConnection() {
    await queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
    await queryClient.refetchQueries({ queryKey: ONBOARDING_QUERY_KEY });
  }

  return (
    <section className={`onboarding ${compact ? 'onboarding--compact' : ''}`}>
      <div className="onboarding__header">
        <p className="onboarding__eyebrow">Next step</p>
        <h3>Install the Cosmo browser extension</h3>
        <p className="muted">
          Add Cosmo from your browser store, then stay signed in here
          {userEmail ? ` as ${userEmail}` : ''} so the extension connects
          automatically.
        </p>
      </div>

      <BrowserStoreButtons featured="chrome" />

      <ol className="onboarding__steps">
        <li className="onboarding__step onboarding__step--active">
          <span className="onboarding__step-num">1</span>
          <div>
            <strong>Add to Chrome</strong>
            <p className="muted">
              Open the Chrome Web Store card, click Add to Chrome, then confirm
              Add extension.
            </p>
          </div>
        </li>
        <li className="onboarding__step">
          <span className="onboarding__step-num">2</span>
          <div>
            <strong>Pin Cosmo</strong>
            <p className="muted">
              Use the puzzle icon in Chrome’s toolbar and pin Cosmo.
            </p>
          </div>
        </li>
        <li className="onboarding__step">
          <span className="onboarding__step-num">3</span>
          <div>
            <strong>Open Naukri</strong>
            <p className="muted">
              Visit Naukri while logged in — the Cosmo co-pilot appears so you
              can Start scanning.
            </p>
          </div>
        </li>
      </ol>

      <div className="onboarding__actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => {
            void refreshConnection();
          }}
        >
          <RefreshCw size={16} strokeWidth={2.2} aria-hidden />
          Check connection
        </button>
      </div>
    </section>
  );
}
