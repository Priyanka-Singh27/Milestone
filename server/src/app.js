// server/src/app.js
//
// Express application factory.
// Mounts all route modules and middleware. Does NOT connect to the database
// (that happens in server.js so tests can swap in mongodb-memory-server).

const express      = require('express');
const cors         = require('cors');
const errorHandler = require('./middleware/errorHandler.middleware');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// FRONTEND_URL can be comma-separated for multi-origin (e.g. localhost + Vercel).
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin (e.g. curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// ── Person D routes (always present) ─────────────────────────────────────────
app.use('/api/v1/auth',      require('./routes/auth.routes'));
app.use('/api/v1/profile',   require('./routes/profile.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));

// ── Person A routes (present in this branch) ─────────────────────────────────
// TODO(integration phase): wrap in requireAuth once auth middleware is retrofitted
// across all modules and the dev-user-1 placeholder is removed.
app.use('/api/v1/roles',   require('./routes/roles.routes'));
app.use('/api/v1/roadmap', require('./routes/roadmap.routes'));
app.use('/api/v1/skills',  require('./routes/skills.routes'));



// ── Person B routes ──────────────────────────────────────────────────────────
app.use('/api/v1/quiz',         require('./routes/quiz.routes'));
app.use('/api/v1/fundamentals', require('./routes/fundamentals.routes'));

// ── Person C routes ──────────────────────────────────────────────────────────
app.use('/api/v1/applications', require('./routes/applications.routes'));
app.use('/api/v1/certificates', require('./routes/certificates.routes'));

// ── 404 handler (JSON, not HTML) ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: `Cannot ${req.method} ${req.path}` } });
});

// ── Central error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;