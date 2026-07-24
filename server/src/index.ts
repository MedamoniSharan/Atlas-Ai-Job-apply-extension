import http from 'http';
import { createApp } from './app';
import { connectMongo } from './config/database';
import { assertSecureEnv, env } from './config/env';
import { logger } from './config/logger';
import { initSocket } from './realtime/socket';

async function bootstrapData(): Promise<void> {
  await connectMongo();
  const { seedPlanConfigs } = await import('./features/billing/planConfig.service');
  await seedPlanConfigs();
}

async function main() {
  assertSecureEnv();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  await new Promise<void>((resolve, reject) => {
    server.listen(env.port, '0.0.0.0', () => {
      logger.info('Server listening', { port: env.port, env: env.nodeEnv });
      resolve();
    });
    server.on('error', reject);
  });

  void bootstrapData().catch((err) => {
    logger.error('MongoDB bootstrap failed (API stays up; health shows mongo down)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  const shutdown = () => {
    logger.info('Shutting down...');
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
