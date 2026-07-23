/**
 * Promote a user to admin by email.
 * Usage: npx tsx scripts/promote-admin.ts --email=you@example.com
 */
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

async function main() {
  const emailArg = process.argv.find((a) => a.startsWith('--email='));
  const email = emailArg?.slice('--email='.length)?.toLowerCase().trim();
  if (!email) {
    console.error('Usage: npx tsx scripts/promote-admin.ts --email=you@example.com');
    process.exit(1);
  }

  const mongoUri =
    process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/atlas';
  await mongoose.connect(mongoUri);

  const result = await mongoose.connection.collection('users').findOneAndUpdate(
    { email },
    { $set: { role: 'admin', status: 'active' } },
    { returnDocument: 'after' }
  );

  if (!result) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  console.log(`Promoted ${email} to admin.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
