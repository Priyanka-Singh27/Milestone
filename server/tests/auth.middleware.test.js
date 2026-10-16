// tests/auth.middleware.test.js
//
// Unit tests for auth.middleware.js — no database required.
// Uses node:test + node:assert (Node 22 built-ins).
//
// Test cases:
//   1. No Authorization header -> 401 NO_TOKEN
//   2. Valid JWT -> req.user set, next() called
//   3. Expired JWT -> 401 SESSION_EXPIRED
//   4. Garbage token -> 401 INVALID_TOKEN
//   5. Internal key accepted when allowInternal:true
//   6. Wrong internal key rejected even when allowInternal:true

const { test, before }      = require('node:test');
const assert                = require('node:assert/strict');
const jwt                   = require('jsonwebtoken');

// Set JWT_SECRET before importing the middleware so verifyToken picks it up
const TEST_SECRET           = 'test-jwt-secret-for-unit-tests';
process.env.JWT_SECRET      = TEST_SECRET;
process.env.INTERNAL_API_KEY = 'test-internal-key';

const { requireAuth, authenticate } = require('../src/middleware/auth.middleware');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockRes() {
  const res = {};
  res.status = (code) => { res._status = code; return res; };
  res.json   = (body) => { res._body   = body;  return res; };
  return res;
}

function makeReq(authHeader, extraHeaders = {}) {
  return { headers: { ...(authHeader ? { authorization: authHeader } : {}), ...extraHeaders } };
}

function validToken(payload = { userId: 'user-1', email: 'a@b.com' }) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '7d' });
}

function expiredToken() {
  return jwt.sign({ userId: 'user-1', email: 'a@b.com' }, TEST_SECRET, { expiresIn: '-1s' });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('1. No Authorization header -> 401 NO_TOKEN', () => {
  const req  = makeReq(null);
  const res  = makeMockRes();
  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(res._status, 401);
  assert.equal(res._body.success, false);
  assert.equal(res._body.error.code, 'NO_TOKEN');
  assert.equal(nextCalled, false);
});

test('2. Valid JWT -> req.user set, next() called', () => {
  const token = validToken();
  const req   = makeReq(`Bearer ${token}`);
  const res   = makeMockRes();
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.userId, 'user-1');
  assert.equal(req.user.email, 'a@b.com');
  assert.equal(req.isInternal, false);
});

test('3. Expired JWT -> 401 SESSION_EXPIRED', () => {
  const token = expiredToken();
  const req   = makeReq(`Bearer ${token}`);
  const res   = makeMockRes();
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(res._status, 401);
  assert.equal(res._body.error.code, 'SESSION_EXPIRED');
  assert.equal(nextCalled, false);
});

test('4. Garbage token -> 401 INVALID_TOKEN', () => {
  const req  = makeReq('Bearer not.a.valid.jwt.at.all');
  const res  = makeMockRes();
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.equal(res._status, 401);
  assert.equal(res._body.error.code, 'INVALID_TOKEN');
  assert.equal(nextCalled, false);
});

test('5. Internal key accepted when allowInternal:true', () => {
  const mw  = authenticate({ allowInternal: true });
  const req = makeReq(null, {
    'x-internal-key': 'test-internal-key',
    'x-user-id':      'user-42',
  });
  const res = makeMockRes();
  let nextCalled = false;

  mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.isInternal, true);
  assert.equal(req.user.userId, 'user-42');
});

test('6. Wrong internal key rejected even with allowInternal:true', () => {
  const mw  = authenticate({ allowInternal: true });
  const req = makeReq(null, {
    'x-internal-key': 'wrong-key',
    'x-user-id':      'user-42',
  });
  const res = makeMockRes();
  let nextCalled = false;

  mw(req, res, () => { nextCalled = true; });

  assert.equal(res._status, 401);
  assert.equal(res._body.error.code, 'INVALID_TOKEN');
  assert.equal(nextCalled, false);
});
