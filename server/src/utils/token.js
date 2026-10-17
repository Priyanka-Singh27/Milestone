// server/src/utils/token.js
//
// JWT helpers. Payload shape (per CONTRACTS.md §6):
//   { userId: string, email: string, iat: number, exp: number }
// Session length: 7 days before re-login required.
//
// The server fails fast at startup if JWT_SECRET is missing — see the guard
// in server.js. This file itself reads it lazily so tests can set it via
// process.env before requiring this module.

const jwt = require('jsonwebtoken');

const SEVEN_DAYS_S = 60 * 60 * 24 * 7; // 604800 seconds

/**
 * Sign a JWT for a user.
 * @param {{ userId: string, email: string }} payload
 * @returns {string} signed JWT
 */
function signToken({ userId, email }) {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: SEVEN_DAYS_S }
  );
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws jwt.JsonWebTokenError or jwt.TokenExpiredError on failure.
 * @param {string} token
 * @returns {{ userId: string, email: string, iat: number, exp: number }}
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
