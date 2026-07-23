/**
 * Create or reset an admin password account.
 * Usage:
 *   npx tsx scripts/ensure-admin.ts --email=admin@cosmo.com --password='your-password' --name=Admin
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
  const email = arg('email')?.toLowerCase().trim();
  const password = arg('password');
  const name = arg('name')?.trim() || 'Admin';

  if (!email || !password || password.length < 8) {
    console.error(
      "Usage: npx tsx scripts/ensure-admin.ts --email=admin@cosmo.com --password='your-password' [--name=Admin]"
    );
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/atlas';
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
