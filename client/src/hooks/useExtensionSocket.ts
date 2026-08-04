import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Refresh onboarding when the tab is focused again.
 * No interval — `useOnboardingStatus` already polls slowly until connected.
 */
export function useExtensionSocket(onConnected: () => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (!accessToken) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        onConnectedRef.current();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [accessToken]);
}
