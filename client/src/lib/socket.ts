import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Application } from '@atlas/shared';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

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

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [accessToken, onUpdate]);
}
