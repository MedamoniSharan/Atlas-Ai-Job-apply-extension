import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Application } from '@cosmo/shared';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.trim() ||
  'https://atlas-ai-job-apply-extension-1.onrender.com';

export function useApplicationSocket(
  onUpdate: (app: Application) => void
) {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    let socket: Socket | null = io(SOCKET_URL || undefined, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socket.on('application.updated', (app: Application) => {
      onUpdate(app);
    });

    socket.on('connect_error', (err) => {
      if (/unauthorized/i.test(err.message)) {
        useAuthStore.getState().clearSession();
      }
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [accessToken, onUpdate]);
}
