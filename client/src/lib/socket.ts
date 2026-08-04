import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Light refresh when the tab becomes visible again.
 * Replaces Socket.IO — no interval polling (that caused request storms).
 */
export function useApplicationSocket(onUpdate: (app?: unknown) => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!accessToken) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        onUpdateRef.current();
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
