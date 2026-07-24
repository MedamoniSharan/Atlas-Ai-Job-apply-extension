import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL?.trim() ||
  'https://atlas-ai-job-apply-extension-1.onrender.com';

export function useExtensionSocket(onConnected: () => void) {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const socket: Socket = io(SOCKET_URL || undefined, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socket.on('extension.connected', onConnected);

    socket.on('connect_error', (err) => {
      if (/unauthorized/i.test(err.message)) {
        useAuthStore.getState().clearSession();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, onConnected]);
}
