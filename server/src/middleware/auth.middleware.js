// server/src/middleware/auth.middleware.js
//
// requireAuth      – a logged-in user (Bearer JWT)
// requireInternal  – ONLY other parts of this server (x-internal-key). A user's
//                    own token is NOT accepted. Used for skill verification and
//                    badge creation, which must only follow a passed quiz.
// authenticate()   – factory kept for backwards compatibility.

const jwt = require('jsonwebtoken');
const { verifyToken } = require('../utils/token');
const { fail } = require('../utils/respond');
const { safeEqual } = require('../utils/crypto');

function hasValidInternalKey(req) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false; // never allow an empty key to match
  return safeEqual(req.headers['x-internal-key'], expected);
}

function authenticate({ allowInternal = false } = {}) {
  return function authMiddleware(req, res, next) {
    if (allowInternal && req.headers['x-internal-key']) {
      const userId = req.headers['x-user-id'];
      if (hasValidInternalKey(req) && userId) {
        req.user = { userId: String(userId), email: null };
        req.isInternal = true;
        return next();
      }
      return fail(res, 401, 'INVALID_TOKEN', 'Invalid internal API key.');
    }

    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return fail(res, 401, 'NO_TOKEN', 'No authentication token provided.');
    }

    try {
      const decoded = verifyToken(authHeader.slice(7));
      if (!decoded || typeof decoded.userId !== 'string' || !decoded.userId) {
        return fail(res, 401, 'INVALID_TOKEN', 'Invalid or malformed token.');
      }
      req.user = { userId: decoded.userId, email: decoded.email };
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

function requireInternal(req, res, next) {
  if (!hasValidInternalKey(req)) {
    return fail(res, 401, 'INVALID_TOKEN', 'This endpoint is for internal use only.');
  }
  req.isInternal = true;
  return next();
}

const requireAuth = authenticate({ allowInternal: false });

module.exports = { requireAuth, requireInternal, authenticate };
