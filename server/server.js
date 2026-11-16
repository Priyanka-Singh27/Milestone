require('dotenv').config();

const { assertEnv } = require('./src/config/env');
assertEnv(); // exits with a clear message if the configuration is wrong

const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { seedFundamentalsIfEmpty } = require('./src/services/fundamentals.service');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();
    await seedFundamentalsIfEmpty();

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    // Graceful shutdown so hosts can restart the service without dropped requests.
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down…`);
      server.close(async () => {
        await mongoose.connection.close().catch(() => {});
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exitCode = 1;
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

startServer();
