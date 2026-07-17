import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../middleware/auth';

let io: Server | null = null;

export function getIo(): Server | null {
  return io;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          env.corsOrigins.some(
            (o) => origin === o || (o.endsWith('://') && origin.startsWith(o))
          )
        ) {
          return callback(null, true);
        }
        if (env.nodeEnv === 'development') return callback(null, true);
        return callback(new Error('CORS blocked'), false);
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.replace('Bearer ', '') as
        | string
        | undefined);

    if (!token) {
      return next(new Error('Unauthorized'));
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as Socket & { userId?: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as Socket & { userId?: string }).userId;
    if (userId) {
      socket.join(`user:${userId}`);
      logger.info('Socket connected', { userId, socketId: socket.id });
    }

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { socketId: socket.id });
    });
  });

  return io;
}
