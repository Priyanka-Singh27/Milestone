// server/src/app.js
//
// Express application factory. Mounts all route modules and the security
// middleware. Does NOT connect to the database (server.js does that, so tests
// can swap in mongodb-memory-server).

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler.middleware');
const { sanitizeBody, apiLimiter } = require('./middleware/security.middleware');
const { origins } = require('./config/env');

const app = express();

app.disable('x-powered-by');
// Render / Vercel / most hosts sit behind one proxy. Needed for correct client
// IPs (rate limiting) and secure cookies.
app.set('trust proxy', 1);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    // The API is called from another origin (the frontend), so let it be read.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// ── CORS ─────────────────────────────────────────────────────────────────────
// FRONTEND_URL may hold several comma-separated origins. A request from any
// other browser origin is simply not given CORS headers (no 500 error).
app.use(
  cors({
    origin: (origin, cb) => {
      const allowed = origins();
      if (!origin) return cb(null, true); // curl, Postman, server-to-server
      return cb(null, allowed.includes(origin));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(sanitizeBody);

// ── Health check (no auth, no database) ──────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// ── Global rate limit ────────────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ── Auth, profile, dashboard ─────────────────────────────────────────────────
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/profile', require('./routes/profile.routes'));
app.use('/api/v1/dashboard', require('./routes/dashboard.routes'));

// ── Roadmap engine ───────────────────────────────────────────────────────────
// roles: public list. roadmap / skills: every route requires a login (see files).
app.use('/api/v1/roles', require('./routes/roles.routes'));
app.use('/api/v1/roadmap', require('./routes/roadmap.routes'));
app.use('/api/v1/skills', require('./routes/skills.routes'));

// ── Quiz + fundamentals ──────────────────────────────────────────────────────
app.use('/api/v1/quiz', require('./routes/quiz.routes'));
app.use('/api/v1/fundamentals', require('./routes/fundamentals.routes'));

// ── Applications + certificates ──────────────────────────────────────────────
app.use('/api/v1/applications', require('./routes/applications.routes'));
app.use('/api/v1/certificates', require('./routes/certificates.routes'));

// ── 404 (JSON, not HTML) ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Cannot ${req.method} ${req.path}` },
  });
});

app.use(errorHandler);

module.exports = app;
