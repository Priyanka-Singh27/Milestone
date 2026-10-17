// server/src/seed/seedUsers.js
//
// Idempotent seed script for the users collection.
// Creates the shared dev placeholder user "dev-user-1" if it doesn't
// already exist. Second run is a no-op and prints a clear message.
//
// The DEV_USER_PASSWORD env var sets the password. If unset, it falls
// back to a documented local-only default — never use this default value
// in production.
//
// Owned by Person D per PROJECT_TASKS.md §4.4 and CONTRACTS.md §9.
// Run manually: npm run seed:users

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User.model');
const connectDB = require('../config/db');

const DEV_USER_ID    = 'dev-user-1';
const DEV_USER_EMAIL = 'dev@preproadmap.local';
const DEV_USER_NAME  = 'Dev User';
const BCRYPT_COST    = 10;

// Local-only default — documented so it's not a secret, and obviously not
// suitable for production. Use DEV_USER_PASSWORD env var to override.
const DEV_USER_PASSWORD_DEFAULT = 'devpassword123';

async function seedUsers() {
  await connectDB();

  const existing = await User.findById(DEV_USER_ID);

  if (existing) {
    console.log(`✅ dev-user-1 already exists (${existing.email}) — no changes made.`);
    await mongoose.disconnect();
    return;
  }

  const password = process.env.DEV_USER_PASSWORD || DEV_USER_PASSWORD_DEFAULT;
  if (!process.env.DEV_USER_PASSWORD) {
    console.warn('⚠️  DEV_USER_PASSWORD not set — using default local-only password. Do not use in production.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  await User.create({
    _id:          DEV_USER_ID,
    name:         DEV_USER_NAME,
    email:        DEV_USER_EMAIL,
    passwordHash,
    authProvider: 'local',
    targetRoleId: null,
  });

  console.log(`✅ Created dev-user-1 (email: ${DEV_USER_EMAIL})`);
  await mongoose.disconnect();
}

seedUsers().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
