require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const {
  seedFundamentalsIfEmpty,
} = require('./src/services/fundamentals.service');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to MongoDB first.
    await connectDB();

    // Ensure the default fundamentals curriculum is persisted.
    await seedFundamentalsIfEmpty();

    // Start accepting requests only after initialization.
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exitCode = 1;
  }
}

startServer();