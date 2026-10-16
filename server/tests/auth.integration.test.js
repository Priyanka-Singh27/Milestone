// tests/auth.integration.test.js
//
// Integration tests for auth, profile, dashboard, and seed.
// Uses mongodb-memory-server — never touches the shared Atlas dev database.
//
// All tests are nested inside a single describe() so that the before/after
// lifecycle hooks properly await the async setup/teardown before any test runs.

const { describe, it, before, after } = require('node:test');
const assert   = require('node:assert/strict');
const http     = require('node:http');
const jwt      = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ── Env vars — must be set before any app module is required ──────────────────
const TEST_SECRET = 'integration-test-secret';
process.env.JWT_SECRET        = TEST_SECRET;
process.env.INTERNAL_API_KEY  = 'test-internal-key';
process.env.INTERNAL_API_URL  = 'http://127.0.0.1:59999'; // nothing listens there — tests dashboard fallback
process.env.FRONTEND_URL      = 'http://localhost:3000';
process.env.LLM_PROVIDER      = 'mock';
process.env.NODE_ENV          = 'test';

// ── Helpers ───────────────────────────────────────────────────────────────────

function expiredToken(userId = 'u1', email = 'x@y.com') {
  return jwt.sign({ userId, email }, TEST_SECRET, { expiresIn: '-1s' });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Module D integration tests', () => {
  let mongod, server, baseUrl;

  // ── Setup ────────────────────────────────────────────────────────────────
  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.DATABASE_URL = mongod.getUri();

    await mongoose.connect(process.env.DATABASE_URL);

    const app = require('../src/app');
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  // ── Teardown ─────────────────────────────────────────────────────────────
  after(async () => {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    await mongoose.disconnect();
    await mongod.stop();
  });

  // ── Helper inside describe so it can access baseUrl ──────────────────────
  async function req(method, path, body, headers = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }

  // ── Auth tests ────────────────────────────────────────────────────────────

  it('1. Signup returns 201 + token; no passwordHash in response', async () => {
    const { status, body } = await req('POST', '/auth/signup', {
      name: 'Alice', email: 'alice@test.com', password: 'password123',
    });
    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.ok(body.data.token, 'should have a token');
    assert.ok(body.data.user, 'should have user object');
    assert.equal(body.data.user.passwordHash, undefined, 'passwordHash must not be in response');
    assert.equal(body.data.user.email, 'alice@test.com');
  });

  it('2. Duplicate email (different case) -> 400 EMAIL_TAKEN', async () => {
    const { status, body } = await req('POST', '/auth/signup', {
      name: 'Alice2', email: 'ALICE@TEST.COM', password: 'password123',
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'EMAIL_TAKEN');
  });

  it('3. Login success returns token', async () => {
    const { status, body } = await req('POST', '/auth/login', {
      email: 'alice@test.com', password: 'password123',
    });
    assert.equal(status, 200);
    assert.ok(body.data.token);
    assert.equal(body.data.user.email, 'alice@test.com');
  });

  it('4. Wrong password -> 401 INVALID_CREDENTIALS', async () => {
    const { status, body } = await req('POST', '/auth/login', {
      email: 'alice@test.com', password: 'wrongpassword',
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('5. Unknown email -> 401 INVALID_CREDENTIALS (same error as wrong password)', async () => {
    const { status, body } = await req('POST', '/auth/login', {
      email: 'nobody@nowhere.com', password: 'anything',
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('6. Google-only account -> 401 USE_GOOGLE_LOGIN', async () => {
    const User = require('../src/models/User.model');
    const exists = await User.findById('google-user-1');
    if (!exists) {
      await User.create({
        _id: 'google-user-1', name: 'Google User', email: 'google@test.com',
        passwordHash: null, authProvider: 'google',
      });
    }
    const { status, body } = await req('POST', '/auth/login', {
      email: 'google@test.com', password: 'anything',
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'USE_GOOGLE_LOGIN');
  });

  // ── Profile tests ─────────────────────────────────────────────────────────

  it('7. GET /profile with no token -> 401 NO_TOKEN', async () => {
    const { status, body } = await req('GET', '/profile');
    assert.equal(status, 401);
    assert.equal(body.error.code, 'NO_TOKEN');
  });

  it('8. GET /profile with valid token -> returns user (no passwordHash)', async () => {
    const loginRes = await req('POST', '/auth/login', {
      email: 'alice@test.com', password: 'password123',
    });
    const token = loginRes.body.data.token;

    const { status, body } = await req('GET', '/profile', undefined, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 200);
    assert.equal(body.data.user.email, 'alice@test.com');
    assert.equal(body.data.user.passwordHash, undefined);
  });

  it('9. Expired token -> 401 SESSION_EXPIRED', async () => {
    const token = expiredToken('some-id', 'alice@test.com');
    const { status, body } = await req('GET', '/profile', undefined, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 401);
    assert.equal(body.error.code, 'SESSION_EXPIRED');
  });

  it('10. PATCH /profile — name change', async () => {
    const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
    const token = loginRes.body.data.token;

    const { status, body } = await req('PATCH', '/profile', { name: 'Alice Updated' }, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 200);
    assert.equal(body.data.user.name, 'Alice Updated');
  });

  it('11. PATCH /profile unknown role -> 400 UNKNOWN_ROLE', async () => {
    const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
    const token = loginRes.body.data.token;

    const { status, body } = await req('PATCH', '/profile', { targetRoleId: 'non-existent-role-id' }, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'UNKNOWN_ROLE');
  });

  it('12. PATCH /profile empty body -> 400 NOTHING_TO_UPDATE', async () => {
    const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
    const token = loginRes.body.data.token;

    const { status, body } = await req('PATCH', '/profile', {}, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'NOTHING_TO_UPDATE');
  });

  it('13. PATCH /profile targetRoleId:null clears it', async () => {
    const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
    const token = loginRes.body.data.token;

    const { status, body } = await req('PATCH', '/profile', { targetRoleId: null }, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 200);
    assert.equal(body.data.user.targetRoleId, null);
  });

  // ── Dashboard tests ───────────────────────────────────────────────────────

  it('14. Dashboard with all modules unreachable -> 200, all unavailable flags set', async () => {
    const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
    const token = loginRes.body.data.token;

    const { status, body } = await req('GET', '/dashboard', undefined, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.roadmap, null);
    assert.equal(body.data.fundamentals, null);
    assert.equal(body.data.applications, null);
    assert.equal(body.data.certificates, null);
    assert.ok(body.data.unavailable?.roadmap,       'roadmap should be unavailable');
    assert.ok(body.data.unavailable?.fundamentals,  'fundamentals should be unavailable');
    assert.ok(body.data.unavailable?.applications,  'applications should be unavailable');
    assert.ok(body.data.unavailable?.certificates,  'certificates should be unavailable');
  });

  it('14b. Dashboard with mocked A/B/C responses asserts correct aggregated counts', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/roadmap/')) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              roadmap: {
                days: [
                  {
                    isBufferDay: false,
                    phase: 'Phase 1: Fundamentals',
                    tasks: [
                      { title: 'Task 1', status: 'completed' },
                      { title: 'Task 2', status: 'pending' },
                      { title: 'Task 3', status: 'verified' },
                    ],
                  },
                  {
                    isBufferDay: true,
                    tasks: [{ title: 'Buffer Task', status: 'pending' }],
                  },
                ],
              },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/fundamentals')) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              areas: [
                {
                  topics: [{ id: 't1' }, { id: 't2' }],
                  progress: [{ topicId: 't1', status: 'completed' }],
                },
                {
                  topics: [{ id: 't3' }],
                  progress: [{ topicId: 't3', status: 'verified' }],
                },
              ],
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/applications')) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              applications: [
                { id: 'app1', status: 'applied' },
                { id: 'app2', status: 'interviewing' },
                { id: 'app3', status: 'applied' },
              ],
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/certificates')) {
          return new Response(JSON.stringify({
            success: true,
            data: {
              certificates: [
                { id: 'c1', type: 'badge' },
                { id: 'c2', type: 'badge' },
                { id: 'c3', type: 'uploaded' },
              ],
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.success, true);

      // Roadmap assertions
      assert.equal(body.data.roadmap.totalTasks, 3);
      assert.equal(body.data.roadmap.completedTasks, 2);
      assert.equal(body.data.roadmap.progressPercent, 67);
      assert.equal(body.data.roadmap.phase, 'Phase 1: Fundamentals');

      // Fundamentals assertions
      assert.equal(body.data.fundamentals.total, 3);
      assert.equal(body.data.fundamentals.completed, 2);

      // Applications byStatus assertions
      assert.equal(body.data.applications.total, 3);
      assert.deepEqual(body.data.applications.byStatus, { applied: 2, interviewing: 1 });

      // Certificates badges vs uploaded assertions
      assert.equal(body.data.certificates.total, 3);
      assert.equal(body.data.certificates.badges, 2);
      assert.equal(body.data.certificates.uploaded, 1);

      // No modules should be flagged unavailable
      assert.deepEqual(body.data.unavailable, {
        roadmap: false,
        fundamentals: false,
        applications: false,
        certificates: false,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14c. Dashboard: 404 response returns null data and unavailable = false', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/roadmap/')) {
          return new Response(JSON.stringify({ success: false, error: { code: 'ROADMAP_NOT_FOUND' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/fundamentals')) {
          return new Response(JSON.stringify({
            success: true,
            data: { areas: [{ topics: [{ id: 't1' }], progress: [] }] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/applications')) {
          return new Response(JSON.stringify({
            success: true,
            data: { applications: [{ id: 'app1', status: 'applied' }] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/certificates')) {
          return new Response(JSON.stringify({
            success: true,
            data: { certificates: [{ id: 'c1', type: 'badge' }] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.roadmap, null, 'roadmap data should be null on 404');
      assert.equal(body.data.unavailable.roadmap, false, 'roadmap unavailable must be false on 404');
      assert.equal(body.data.fundamentals.total, 1);
      assert.equal(body.data.unavailable.fundamentals, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14d. Dashboard: Empty result returns null data and unavailable = false', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/roadmap/')) {
          // Empty days/tasks
          return new Response(JSON.stringify({
            success: true,
            data: { roadmap: { days: [] } },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/fundamentals')) {
          // Empty curriculum
          return new Response(JSON.stringify({
            success: true,
            data: { areas: [] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/applications')) {
          // Empty applications
          return new Response(JSON.stringify({
            success: true,
            data: { applications: [] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('/certificates')) {
          // Empty certificates
          return new Response(JSON.stringify({
            success: true,
            data: { certificates: [] },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.roadmap, null, 'empty roadmap should parse to null');
      assert.equal(body.data.fundamentals, null, 'empty fundamentals should parse to null');
      assert.equal(body.data.applications, null, 'empty applications should parse to null');
      assert.equal(body.data.certificates, null, 'empty certificates should parse to null');

      assert.deepEqual(body.data.unavailable, {
        roadmap: false,
        fundamentals: false,
        applications: false,
        certificates: false,
      }, 'empty results must set unavailable = false');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14e. Dashboard: Network error sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/roadmap/')) {
          throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:5000');
        }
        if (u.includes('/fundamentals') || u.includes('/applications') || u.includes('/certificates')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.roadmap, null);
      assert.equal(body.data.unavailable.roadmap, true, 'network error must set unavailable = true');
      assert.equal(body.data.unavailable.fundamentals, false);
      assert.equal(body.data.unavailable.applications, false);
      assert.equal(body.data.unavailable.certificates, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14f. Dashboard: Timeout error sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/fundamentals')) {
          const timeoutErr = new Error('The operation was aborted due to timeout');
          timeoutErr.name = 'AbortError';
          throw timeoutErr;
        }
        if (u.includes('/roadmap/') || u.includes('/applications') || u.includes('/certificates')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.fundamentals, null);
      assert.equal(body.data.unavailable.fundamentals, true, 'timeout must set unavailable = true');
      assert.equal(body.data.unavailable.roadmap, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14g. Dashboard: 5xx server error sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/applications')) {
          return new Response(JSON.stringify({ success: false, error: { code: 'DATABASE_FAILURE' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/roadmap/') || u.includes('/fundamentals') || u.includes('/certificates')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.applications, null);
      assert.equal(body.data.unavailable.applications, true, '500 status must set unavailable = true');
      assert.equal(body.data.unavailable.roadmap, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14h. Dashboard: Non-JSON response sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/certificates')) {
          return new Response('<html><body>502 Bad Gateway from reverse proxy</body></html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (u.includes('/roadmap/') || u.includes('/fundamentals') || u.includes('/applications')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.certificates, null);
      assert.equal(body.data.unavailable.certificates, true, 'non-JSON response must set unavailable = true');
      assert.equal(body.data.unavailable.roadmap, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14i. Dashboard: 404 with ROUTE_NOT_FOUND sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/fundamentals')) {
          return new Response(JSON.stringify({
            success: false,
            error: { code: 'ROUTE_NOT_FOUND', message: 'Cannot GET /api/v1/fundamentals' },
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/roadmap/') || u.includes('/applications') || u.includes('/certificates')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.fundamentals, null);
      assert.equal(body.data.unavailable.fundamentals, true, 'ROUTE_NOT_FOUND 404 must set unavailable = true');
      assert.equal(body.data.unavailable.roadmap, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('14j. Dashboard: 404 with non-standard body shape sets unavailable = true and null data', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('/applications')) {
          return new Response(JSON.stringify({ message: 'Page not found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('/roadmap/') || u.includes('/fundamentals') || u.includes('/certificates')) {
          return new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const loginRes = await req('POST', '/auth/login', { email: 'alice@test.com', password: 'password123' });
      const token = loginRes.body.data.token;

      const { status, body } = await req('GET', '/dashboard', undefined, {
        Authorization: `Bearer ${token}`,
      });

      assert.equal(status, 200);
      assert.equal(body.data.applications, null);
      assert.equal(body.data.unavailable.applications, true, 'non-standard 404 body must set unavailable = true');
      assert.equal(body.data.unavailable.roadmap, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── Seed tests ────────────────────────────────────────────────────────────

  it('15. Seed run twice -> second run is no-op, no duplicate created', async () => {
    const User   = require('../src/models/User.model');
    const bcrypt = require('bcryptjs');

    // Inline the seed logic (can't call seedUsers.js directly — it calls process.exit)
    const DEV_USER_ID    = 'dev-user-1';
    const DEV_USER_EMAIL = 'dev@preproadmap.local';

    async function runSeed() {
      const existing = await User.findById(DEV_USER_ID);
      if (existing) return 'already_exists';
      const passwordHash = await bcrypt.hash('devpassword123', 10);
      await User.create({
        _id: DEV_USER_ID, name: 'Dev User', email: DEV_USER_EMAIL,
        passwordHash, authProvider: 'local', targetRoleId: null,
      });
      return 'created';
    }

    const first  = await runSeed();
    const second = await runSeed();
    const count  = await User.countDocuments({ _id: DEV_USER_ID });

    assert.equal(first, 'created', 'first run should create the user');
    assert.equal(second, 'already_exists', 'second run should be a no-op');
    assert.equal(count, 1, 'should have exactly one dev-user-1 document');
  });

  // ── Route boot test ───────────────────────────────────────────────────────

  it('16. app.js boots with only A + D route files present', () => {
    const app = require('../src/app');
    assert.ok(app, 'app should be defined');
    assert.equal(typeof app.handle, 'function', 'app should be a valid express instance');
  });

  // ── Google OAuth callback test ────────────────────────────────────────────

  it('17. Google callback (mock fetch) lowercases email and links googleId to existing local account', async () => {
    const User   = require('../src/models/User.model');
    const bcrypt = require('bcryptjs');

    await User.create({
      _id:          'local-user-charlie',
      name:         'Charlie Local',
      email:        'charlie@test.com',
      passwordHash: await bcrypt.hash('password123', 10),
      authProvider: 'local',
      googleId:     null,
    });

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url, options) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'mock-google-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (u.includes('googleapis.com/oauth2/v3/userinfo')) {
          return new Response(JSON.stringify({
            sub:   'google-sub-789',
            email: 'CHARLIE@TEST.COM', // Mixed-case to assert lowercasing
            name:  'Charlie Google',
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/auth/google/callback?code=mock-code&state=mock-state`, {
        headers: {
          Cookie: 'google_oauth_state=mock-state',
        },
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      const location = res.headers.get('location');
      assert.ok(location, 'must redirect to frontend callback');
      assert.ok(location.includes('#token='), 'must deliver JWT in URL fragment');

      const updatedUser = await User.findById('local-user-charlie');
      assert.ok(updatedUser);
      assert.equal(updatedUser.email, 'charlie@test.com', 'email must be lowercased');
      assert.equal(updatedUser.googleId, 'google-sub-789', 'googleId must be linked to existing account');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── Catch-all 404 test ────────────────────────────────────────────────────

  it('18. app.js catch-all 404 returns code ROUTE_NOT_FOUND', async () => {
    const { status, body } = await req('GET', '/non-existent-endpoint-xyz');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(body.error.message.includes('Cannot GET /api/v1/non-existent-endpoint-xyz'));
  });
});

