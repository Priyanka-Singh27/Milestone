// server/src/middleware/security.middleware.js
//
// Shared security helpers: input sanitising, rate limiters, ownership checks.

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { fail } = require('../utils/respond');

/* ---------- NoSQL-injection guard ----------
 * Removes keys that start with "$" or contain "." from the JSON body, so
 * {"email": {"$gt": ""}} can never reach a Mongo query as an operator. */
function stripDangerousKeys(value, depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripDangerousKeys(v, depth + 1));
  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.')) continue;
    clean[k] = stripDangerousKeys(v, depth + 1);
  }
  return clean;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = stripDangerousKeys(req.body);
  next();
}

/* ---------- rate limiting ---------- */
const json429 = (code, message) => (req, res) =>
  fail(res, 429, code, message);

const baseOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
};

const userOrIp = (req) =>
  req.user?.userId ? `u:${req.user.userId}` : ipKeyGenerator(req.ip || '');

/** Whole API: generous, stops scripts hammering the server. */
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 300,
  handler: json429('RATE_LIMITED', 'Too many requests. Please slow down and try again shortly.'),
});

/** Login / signup: slows password guessing and mass account creation. */
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  handler: json429('RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'),
});

/** Anything that calls the AI model or is otherwise expensive. */
const expensiveLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 15,
  keyGenerator: userOrIp,
  handler: json429('RATE_LIMITED', 'You are doing that too often. Please wait a few minutes.'),
});

/** Uploads. */
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: userOrIp,
  handler: json429('RATE_LIMITED', 'Too many uploads. Please wait a few minutes.'),
});

/* ---------- ownership ----------
 * If a request names a userId (body, query or path), it must be the caller's. */
function assertSelf(req, res, claimedId) {
  if (claimedId !== undefined && claimedId !== null && String(claimedId) !== req.user.userId) {
    fail(res, 403, 'FORBIDDEN', 'You can only access your own data.');
    return false;
  }
  return true;
}

/** Query/body values that must be plain strings (never objects or arrays). */
const asString = (v) => (typeof v === 'string' ? v : undefined);

module.exports = {
  sanitizeBody,
  stripDangerousKeys,
  apiLimiter,
  authLimiter,
  expensiveLimiter,
  uploadLimiter,
  assertSelf,
  asString,
};
