import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

const MONGO_CONNECT_MS = 15_000;

export async function connectMongo(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: MONGO_CONNECT_MS,
    connectTimeoutMS: MONGO_CONNECT_MS,
  });
  logger.info('MongoDB connected', {
    uri: env.mongoUri.replace(/\/\/.*@/, '//***@'),
  });
  return mongoose;
}
