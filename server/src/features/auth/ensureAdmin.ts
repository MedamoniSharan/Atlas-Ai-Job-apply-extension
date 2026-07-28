import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { UserModel } from '../users/user.model';

/**
 * Create/reset password-admin accounts from ADMIN_EMAILS + ADMIN_PASSWORD.
 * Runs on server bootstrap so .env credentials actually work for /admin/login.
 */
export async function ensureAdminFromEnv(): Promise<void> {
  const password = env.adminPassword;
  const emails = env.adminEmails;
  if (!password || emails.length === 0) return;

  const passwordHash = await bcrypt.hash(password, 12);

  for (const email of emails) {
    await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          name: 'Admin',
          passwordHash,
          role: 'admin',
          status: 'active',
        },
        $setOnInsert: {
          plan: 'free',
        },
        $unset: { googleId: '' },
      },
      { upsert: true, new: true }
    );
    logger.info('Admin account ready', { email });
  }
}
