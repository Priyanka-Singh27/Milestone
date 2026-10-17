// server/src/controllers/auth.controller.js
//
// Handles signup, login, and Google OAuth (GET /auth/google + callback).
//
// CONTRACTS.md §6 Auth rules enforced here:
//   - JWT payload: { userId, email, iat, exp }
//   - Session length: 7 days
//   - Email always lowercased
//   - Identical INVALID_CREDENTIALS error for unknown email AND wrong password
//     (prevents user enumeration)
//   - Google-only accounts get USE_GOOGLE_LOGIN on password-login attempt
//
// SIMPLIFICATIONS (documented per task brief §8):
//   - Google OAuth built last; email/password must work without Google configured.
//   - No refresh tokens — 7-day JWT, then re-login.
//   - No password reset, email verification, or account deletion.
//   - No rate limiting (listed as future work).

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const User    = require('../models/User.model');
const { signToken } = require('../utils/token');
const { ok, fail }  = require('../utils/respond');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_COST = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return crypto.randomUUID();
}

// ── POST /api/v1/auth/signup ──────────────────────────────────────────────────

async function signup(req, res, next) {
  try {
    const { name, email: rawEmail, password } = req.body;

    // Validate presence
    if (!name || !rawEmail || !password) {
      return fail(res, 400, 'MISSING_FIELDS', 'name, email, and password are required.');
    }

    const email = String(rawEmail).toLowerCase().trim();

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return fail(res, 400, 'INVALID_EMAIL', 'Please provide a valid email address.');
    }

    // Validate password strength (min 8 chars — simple rule per spec)
    if (String(password).length < 8) {
      return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
    }

    // Check duplicate (case-insensitive because email is stored lowercase)
    const existing = await User.findOne({ email });
    if (existing) {
      return fail(res, 400, 'EMAIL_TAKEN', 'That email is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const userId       = generateId();

    const user = await User.create({
      _id:          userId,
      name:         String(name).trim(),
      email,
      passwordHash,
      authProvider: 'local',
    });

    const token = signToken({ userId, email });
    return ok(res, { token, user: user.toPublic() }, 201);

  } catch (err) {
    return next(err);
  }
}

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return fail(res, 400, 'MISSING_FIELDS', 'email and password are required.');
    }

    const email = String(rawEmail).toLowerCase().trim();
    const user  = await User.findOne({ email });

    // Unknown email — same error as wrong password (prevents enumeration)
    if (!user) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    // Account created via Google — no passwordHash
    if (user.authProvider === 'google' && !user.passwordHash) {
      return fail(res, 401, 'USE_GOOGLE_LOGIN', 'This account uses Google Sign-In. Please log in with Google.');
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const token = signToken({ userId: user._id, email: user.email });
    return ok(res, { token, user: user.toPublic() });

  } catch (err) {
    return next(err);
  }
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
//
// SIMPLIFICATION: Google OAuth is built last (after email/password is working).
// If GOOGLE_CLIENT_ID is not set, GET /auth/google returns GOOGLE_NOT_CONFIGURED.
//
// OAuth2 flow (no Passport — uses built-in fetch + the OAuth2 code exchange):
//   1. GET /auth/google — generate random state, store in short-lived cookie,
//      redirect to Google consent screen.
//   2. GET /auth/google/callback — verify state cookie, exchange code for tokens,
//      fetch userinfo, create/find user, redirect to frontend with JWT in fragment.
//
// Cookie choice: sameSite:'none' secure:true in production because the API and
// frontend will be on different domains (Render vs. Vercel). In development,
// secure:false and sameSite:'lax' so it works over HTTP localhost.

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL  = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_COOKIE     = 'google_oauth_state';

async function googleStart(req, res) {
  const { GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID) {
    return fail(res, 501, 'GOOGLE_NOT_CONFIGURED', 'Google Sign-In is not configured on this server.');
  }

  const state  = crypto.randomBytes(16).toString('hex');
  const isProduction = process.env.NODE_ENV === 'production';

  // Store state in a short-lived httpOnly cookie (10 min)
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    maxAge:   10 * 60 * 1000,
    secure:   isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });

  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
  });

  return res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

async function googleCallback(req, res, next) {
  try {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI,
      FRONTEND_URL,
    } = process.env;

    const frontendBase = FRONTEND_URL || 'http://localhost:3000';
    const { code, state, error } = req.query;

    // Google returned an error (user denied consent, etc.)
    if (error) {
      return res.redirect(`${frontendBase}/login?error=GOOGLE_DENIED`);
    }

    // Verify state to prevent CSRF
    const storedState = req.cookies?.[STATE_COOKIE];
    if (!state || !storedState || state !== storedState) {
      return res.redirect(`${frontendBase}/login?error=GOOGLE_STATE_MISMATCH`);
    }

    // Clear the state cookie
    res.clearCookie(STATE_COOKIE);

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  GOOGLE_REDIRECT_URI,
        grant_type:    'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('[googleCallback] token exchange failed:', await tokenRes.text());
      return res.redirect(`${frontendBase}/login?error=GOOGLE_TOKEN_FAILED`);
    }

    const { access_token } = await tokenRes.json();

    // Fetch user info
    const userInfoRes = await fetch(GOOGLE_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userInfoRes.ok) {
      return res.redirect(`${frontendBase}/login?error=GOOGLE_USERINFO_FAILED`);
    }

    const { sub: googleId, email: rawEmail, name } = await userInfoRes.json();
    const email = String(rawEmail).toLowerCase().trim();

    // Find existing user or create a new one
    let user = await User.findOne({ email });

    if (user) {
      // Link googleId if this was a local account signing in with Google for the first time
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      // New account — no passwordHash
      const userId = generateId();
      user = await User.create({
        _id:          userId,
        name:         name || email,
        email,
        passwordHash: null,
        authProvider: 'google',
        googleId,
      });
    }

    const token = signToken({ userId: user._id, email: user.email });

    // Deliver token via URL fragment (not query string) so it doesn't end up
    // in server logs or the browser's history. The frontend reads it on the
    // /auth/callback page via window.location.hash.
    return res.redirect(`${frontendBase}/auth/callback#token=${token}`);

  } catch (err) {
    return next(err);
  }
}

module.exports = { signup, login, googleStart, googleCallback };
