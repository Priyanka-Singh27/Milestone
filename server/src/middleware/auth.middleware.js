// server/src/middleware/auth.middleware.js
//
// Two exports:
//
//   requireAuth         — standard JWT guard for user-facing protected routes.
//                         Sets req.user = { userId, email } on success.
//
//   authenticate(opts)  — factory that produces a middleware. When called with
//                         { allowInternal: true } it also accepts an internal
//                         service-to-service call identified by:
//                           x-internal-key: <INTERNAL_API_KEY>
//                           x-user-id:      <userId on whose behalf>
//                         Sets req.isInternal = true in that case.
//                         Used for PATCH /skills/verify and POST /certificates/badge.
//
// Error codes (per CONTRACTS.md §3):
//   NO_TOKEN       — Authorization header missing or not "Bearer ..."
//   SESSION_EXPIRED — jwt.TokenExpiredError
//   INVALID_TOKEN  — anything else (bad signature, malformed, etc.)

const { verifyToken } = require('../utils/token');
const { fail }        = require('../utils/respond');
const jwt             = require('jsonwebtoken');

/**
 * Middleware factory.
 * @param {{ allowInternal?: boolean }} opts
 */
function authenticate({ allowInternal = false } = {}) {
  return function authMiddleware(req, res, next) {
    // ── Internal service-to-service path ──────────────────────────────────
    if (allowInternal) {
      const internalKey = req.headers['x-internal-key'];
      const userId      = req.headers['x-user-id'];

      if (internalKey && internalKey === process.env.INTERNAL_API_KEY && userId) {
        req.user       = { userId, email: null };
        req.isInternal = true;
        return next();
      }
      // If the caller sent x-internal-key but it's wrong, reject immediately
      // rather than falling through to JWT (avoids ambiguous error messages).
      if (internalKey && internalKey !== process.env.INTERNAL_API_KEY) {
        return fail(res, 401, 'INVALID_TOKEN', 'Invalid internal API key.');
      }
    }

    // ── Standard JWT path ─────────────────────────────────────────────────
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return fail(res, 401, 'NO_TOKEN', 'No authentication token provided.');
    }

    const token = authHeader.slice(7); // strip "Bearer "

    try {
      const decoded  = verifyToken(token);
      req.user       = { userId: decoded.userId, email: decoded.email };
      req.isInternal = false;
      return next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return fail(res, 401, 'SESSION_EXPIRED', 'Your session expired — please log in again.');
      }
      return fail(res, 401, 'INVALID_TOKEN', 'Invalid or malformed token.');
    }
  };
}

// Pre-built instance for the common case (no internal calls allowed).
const requireAuth = authenticate({ allowInternal: false });

module.exports = { requireAuth, authenticate };
