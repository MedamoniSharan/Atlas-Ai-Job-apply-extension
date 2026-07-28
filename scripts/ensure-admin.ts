/**
 * Create or reset an admin password account.
 * Usage:
 *   npx tsx scripts/ensure-admin.ts
 *   npx tsx scripts/ensure-admin.ts --email=admin@cosmo.com --password='your-password' --name=Admin
 *
 * Without flags, uses ADMIN_EMAILS + ADMIN_PASSWORD from .env.
 */
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found?.slice(name.length + 3);
}

async function main() {
  const envEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email =
    arg('email')?.toLowerCase().trim() || envEmails[0];
  const password = arg('password') || process.env.ADMIN_PASSWORD?.trim();
  const name = arg('name')?.trim() || 'Admin';

  if (!email || !password) {
    console.error(
      "Usage: npx tsx scripts/ensure-admin.ts [--email=admin@cosmo.com] [--password='your-password'] [--name=Admin]\n" +
        'Or set ADMIN_EMAILS and ADMIN_PASSWORD in .env'
    );
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/cosmo';
  await mongoose.connect(mongoUri);

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await mongoose.connection.collection('users').findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        name,
        passwordHash,
        role: 'admin',
        status: 'active',
        updatedAt: new Date(),
      },
      $setOnInsert: {
        plan: 'free',
        createdAt: new Date(),
      },
      $unset: { googleId: '' },
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log(`Admin ready: ${result?.email ?? email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
