require('dotenv').config();

// ── Fail fast if JWT_SECRET is missing ───────────────────────────────────────
// Without JWT_SECRET every token would be signed with an undefined secret,
// producing tokens that appear valid locally but break in production. Catch
// this at boot rather than on the first auth request.
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set. Server cannot start.');
  process.exit(1);
}

const app       = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  // Seed B's fundamentals if the module exists and the table is empty.
  // Guard with MODULE_NOT_FOUND so the server boots cleanly before the merge.
  try {
    const { seedFundamentalsIfEmpty } = require('./src/seed/seedFundamentals');
    await seedFundamentalsIfEmpty();
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
      console.warn('[server] seedFundamentalsIfEmpty failed (non-critical):', e.message);
    }
    // else: Person B's seed module not yet merged — silently skip
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});