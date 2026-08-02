/**
 * Read-only admin audit: lists admin accounts and reports whether the
 * ADMIN_PASSWORD in .env still matches each stored bcrypt hash.
 * Usage: npx tsx scripts/check-admin.ts
 */
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

async function main() {
  const mongoUri = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/cosmo';
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  const envEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  console.log(`host: ${mongoUri.replace(/\/\/[^@]*@/, '//<redacted>@')}`);
  console.log(`ADMIN_EMAILS: ${envEmails.join(', ') || '(unset)'}`);
  console.log(`ADMIN_PASSWORD set: ${envPassword ? 'yes' : 'no'}\n`);

  await mongoose.connect(mongoUri);

  const users = mongoose.connection.collection('users');
  const admins = await users
    .find({ $or: [{ role: 'admin' }, { email: { $in: envEmails } }] })
    .toArray();

  if (admins.length === 0) {
    console.log('No admin accounts found in this database.');
  }

  for (const a of admins) {
    const hash = a.passwordHash as string | undefined;
    const matches =
      envPassword && hash ? await bcrypt.compare(envPassword, hash) : null;
    console.log(`email:       ${a.email}`);
    console.log(`  role:      ${a.role}`);
    console.log(`  status:    ${a.status}`);
    console.log(`  plan:      ${a.plan}`);
    console.log(`  password:  ${hash ? 'set (bcrypt)' : 'NOT set'}`);
    console.log(`  googleId:  ${a.googleId ? 'linked' : 'none'}`);
    console.log(
      `  .env password matches: ${
        matches === null ? 'n/a' : matches ? 'YES' : 'NO'
      }`
    );
    console.log(`  createdAt: ${a.createdAt?.toISOString?.() ?? 'n/a'}`);
    console.log(`  updatedAt: ${a.updatedAt?.toISOString?.() ?? 'n/a'}\n`);
  }

  const total = await users.countDocuments();
  console.log(`total users in db: ${total}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
