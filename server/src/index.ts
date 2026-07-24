import http from 'http';
import { createApp } from './app';
import { connectMongo } from './config/database';
import { assertSecureEnv, env } from './config/env';
import { logger } from './config/logger';
import { initSocket } from './realtime/socket';

async function main() {
  assertSecureEnv();
  await connectMongo();
  const { seedPlanConfigs } = await import('./features/billing/planConfig.service');
  await seedPlanConfigs();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    logger.info('Server listening', { port: env.port, env: env.nodeEnv });
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
