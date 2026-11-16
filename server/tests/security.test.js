// tests/security.test.js
//
// Security + deployment checks that need NO database: the real Express app is
// exercised over HTTP while Mongoose models are stubbed.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-'.repeat(4);
process.env.INTERNAL_API_KEY = 'internal-key-'.repeat(2);
process.env.FRONTEND_URL = 'https://milestone.example.com, http://localhost:5173/';
process.env.INTERNAL_API_URL = 'http://localhost:5000/api/v1';

const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { signToken } = require('../src/utils/token');
const Roadmap = require('../src/models/Roadmap.model');
const Application = require('../src/models/Application.model');
const Certificate = require('../src/models/Certificate.model');
const SkillProfile = require('../src/models/SkillProfile.model');
const QuizAttempt = require('../src/models/QuizAttempt.model');
const { FundamentalsTopic, FundamentalsProgress } = require('../src/models/Fundamentals.model');

let server;
let base;
const alice = signToken({ userId: 'alice-id', email: 'a@x.com' });
const bob = signToken({ userId: 'bob-id', email: 'b@x.com' });

before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  mock.restoreAll();
  await new Promise((r) => server.close(r));
});

const call = async (method, path, { token, body, headers = {}, raw } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
};

/* ------------------------------------------------------------------ */
/*  1. Everything private requires a login                            */
/* ------------------------------------------------------------------ */
test('S1. Every private route answers 401 NO_TOKEN without a token', async () => {
  const routes = [
    ['GET', '/profile'], ['PATCH', '/profile'], ['GET', '/dashboard'],
    ['GET', '/roadmap/anyone'], ['POST', '/roadmap/generate'], ['POST', '/roadmap/estimate'],
    ['PATCH', '/roadmap/task/x'], ['POST', '/skills/gap'], ['GET', '/skills/verified'],
    ['POST', '/skills/extract'], ['GET', '/quiz/status/t'], ['GET', '/quiz/availability/t'],
    ['POST', '/quiz/generate/t'], ['POST', '/quiz/submit'], ['GET', '/fundamentals'],
    ['PATCH', '/fundamentals/task/t'], ['GET', '/applications'], ['POST', '/applications'],
    ['PATCH', '/applications/507f1f77bcf86cd799439011'], ['DELETE', '/applications/507f1f77bcf86cd799439011'],
    ['GET', '/applications/sheets/status'], ['GET', '/applications/sheets/connect'],
    ['POST', '/applications/sync-sheets'], ['GET', '/certificates'], ['POST', '/certificates/upload'],
    ['DELETE', '/certificates/507f1f77bcf86cd799439011'],
  ];
  for (const [m, p] of routes) {
    const r = await call(m, p, m === 'GET' || m === 'DELETE' ? {} : { body: {} });
    assert.equal(r.status, 401, `${m} ${p} should be 401, got ${r.status}`);
    assert.equal(r.json.error.code, 'NO_TOKEN', `${m} ${p}`);
  }
});

test('S2. A garbage or wrong-secret token -> 401 INVALID_TOKEN', async () => {
  const forged = require('jsonwebtoken').sign({ userId: 'alice-id' }, 'a-different-secret');
  for (const t of ['not-a-jwt', forged]) {
    const r = await call('GET', '/profile', { token: t });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'INVALID_TOKEN');
  }
});

test('S3. An expired token -> 401 SESSION_EXPIRED', async () => {
  const jwt = require('jsonwebtoken');
  const expired = jwt.sign({ userId: 'alice-id' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const r = await call('GET', '/profile', { token: expired });
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'SESSION_EXPIRED');
});

/* ------------------------------------------------------------------ */
/*  2. Internal-only endpoints cannot be reached with a user token     */
/* ------------------------------------------------------------------ */
test('S4. /skills/verify and /certificates/badge reject students (even logged in)', async () => {
  const v = await call('PATCH', '/skills/verify', { token: alice, body: { userId: 'alice-id', topicId: 'python' } });
  assert.equal(v.status, 401);
  const b = await call('POST', '/certificates/badge', { token: alice, body: { userId: 'alice-id', title: 'Free badge' } });
  assert.equal(b.status, 401);
  const wrong = await call('POST', '/certificates/badge', {
    headers: { 'x-internal-key': 'guess' }, body: { userId: 'alice-id', title: 'Free badge' },
  });
  assert.equal(wrong.status, 401);
});

test('S5. The internal key is accepted on the internal endpoints', async () => {
  const r = await call('POST', '/certificates/badge', {
    headers: { 'x-internal-key': process.env.INTERNAL_API_KEY },
    body: { userId: 'alice-id' }, // no title -> reaches the handler, fails validation
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
});

test('S6. Badge creation is idempotent: a second pass returns the same badge', async () => {
  const existing = { _id: 'b1', type: 'badge', tags: ['python'] };
  mock.method(Certificate, 'findOne', async () => existing);
  const create = mock.method(Certificate, 'create', async () => { throw new Error('must not create'); });
  const r = await call('POST', '/certificates/badge', {
    headers: { 'x-internal-key': process.env.INTERNAL_API_KEY },
    body: { userId: 'alice-id', topicId: 'python', title: 'Python', quizScore: 90 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.certificate._id, 'b1');
  assert.equal(create.mock.callCount(), 0);
  mock.restoreAll();
});

/* ------------------------------------------------------------------ */
/*  3. Ownership                                                       */
/* ------------------------------------------------------------------ */
test('S7. Reading another user\'s roadmap -> 403 FORBIDDEN', async () => {
  const r = await call('GET', '/roadmap/bob-id', { token: alice });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'FORBIDDEN');
});

test('S8. A userId in the body that is not yours -> 403 FORBIDDEN', async () => {
  const r = await call('PATCH', '/roadmap/task/t::0', { token: alice, body: { userId: 'bob-id', status: 'completed' } });
  assert.equal(r.status, 403);
  const g = await call('POST', '/roadmap/generate', {
    token: alice,
    body: { userId: 'bob-id', targetRoleId: 'x', gapTopicIds: [], hoursPerDay: 2 },
  });
  assert.equal(g.status, 403);
});

test('S9. Students cannot set a task to "verified" or an unknown status', async () => {
  for (const status of ['verified', 'hacked', 7]) {
    const r = await call('PATCH', '/roadmap/task/t::0', { token: alice, body: { status } });
    assert.equal(r.status, 400, String(status));
    assert.equal(r.json.error.code, 'INVALID_INPUT');
  }
});

test('S10. A verified task cannot be changed back', async () => {
  const roadmap = {
    days: [{ dayNumber: 1, tasks: [{ id: 't::0', status: 'verified' }] }],
    save: async () => {},
  };
  mock.method(Roadmap, 'findOne', async () => roadmap);
  const r = await call('PATCH', '/roadmap/task/t::0', { token: alice, body: { status: 'not_started', dayNumber: 1 } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'TASK_VERIFIED');
  mock.restoreAll();
});

test('S11. Generating when a roadmap exists needs replace:true (409 ROADMAP_EXISTS)', async () => {
  mock.method(Roadmap, 'exists', async () => ({ _id: 'r1' }));
  const r = await call('POST', '/roadmap/generate', {
    token: alice,
    body: { targetRoleId: 'role', gapTopicIds: ['a'], hoursPerDay: 2, daysPerWeek: 5, bufferInterval: 0 },
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'ROADMAP_EXISTS');
  mock.restoreAll();
});

test('S12. Roadmap input is bounded (no 1000-hour days, no giant arrays)', async () => {
  const bad = [
    { targetRoleId: 'r', gapTopicIds: ['a'], hoursPerDay: 1000 },
    { targetRoleId: 'r', gapTopicIds: ['a'], hoursPerDay: 2, daysPerWeek: 9 },
    { targetRoleId: 'r', gapTopicIds: ['a'], hoursPerDay: 2, bufferInterval: -1 },
    { targetRoleId: 'r', gapTopicIds: Array(500).fill('a'), hoursPerDay: 2 },
    { targetRoleId: 'r', gapTopicIds: [{ $ne: 1 }], hoursPerDay: 2 },
  ];
  for (const body of bad) {
    const r = await call('POST', '/roadmap/estimate', { token: alice, body });
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(r.json.error.code, 'INVALID_INPUT');
  }
});

test('S13. Application update/delete are scoped to the owner', async () => {
  const id = '507f1f77bcf86cd799439011';
  const upd = mock.method(Application, 'findOneAndUpdate', async () => null);
  const del = mock.method(Application, 'findOneAndDelete', async () => null);

  const u = await call('PATCH', `/applications/${id}`, { token: bob, body: { notes: 'mine now' } });
  assert.equal(u.status, 404);
  assert.deepEqual(upd.mock.calls[0].arguments[0], { _id: id, userId: 'bob-id' });

  const d = await call('DELETE', `/applications/${id}`, { token: bob });
  assert.equal(d.status, 404);
  assert.deepEqual(del.mock.calls[0].arguments[0], { _id: id, userId: 'bob-id' });
  mock.restoreAll();
});

test('S14. Applications ignore mass-assignment (userId/lastUpdated cannot be set)', async () => {
  const create = mock.method(Application, 'create', async (doc) => ({ ...doc, _id: 'new' }));
  mock.method(Application, 'countDocuments', async () => 0);
  const r = await call('POST', '/applications', {
    token: alice,
    body: { company: ' Acme ', role: 'Intern', userId: 'alice-id', _id: 'evil', isAdmin: true, lastUpdated: '2000-01-01' },
  });
  assert.equal(r.status, 201);
  const doc = create.mock.calls[0].arguments[0];
  assert.equal(doc.userId, 'alice-id');
  assert.equal(doc.company, 'Acme');
  assert.equal(doc._id, undefined);
  assert.equal(doc.isAdmin, undefined);
  assert.equal(doc.lastUpdated, undefined);
  mock.restoreAll();
});

test('S15. Application validation: required, types, lengths, dates', async () => {
  const cases = [
    [{ role: 'x' }, 'company'],
    [{ company: 'x' }, 'role'],
    [{ company: 5, role: 'x' }, 'text'],
    [{ company: 'x'.repeat(121), role: 'x' }, '120'],
    [{ company: 'x', role: 'y', appliedDate: 'not-a-date' }, 'date'],
    [{ company: 'x', role: 'y', notes: 'n'.repeat(2001) }, '2000'],
  ];
  for (const [body, hint] of cases) {
    const r = await call('POST', '/applications', { token: alice, body });
    assert.equal(r.status, 400, hint);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR', hint);
  }
});

test('S16. Certificate delete is scoped to the owner; badges cannot be deleted', async () => {
  const id = '507f1f77bcf86cd799439012';
  const find = mock.method(Certificate, 'findOne', async () => null);
  const r = await call('DELETE', `/certificates/${id}`, { token: bob });
  assert.equal(r.status, 404);
  assert.deepEqual(find.mock.calls[0].arguments[0], { _id: id, userId: 'bob-id' });
  mock.restoreAll();

  mock.method(Certificate, 'findOne', async () => ({ _id: id, type: 'badge', userId: 'bob-id' }));
  const b = await call('DELETE', `/certificates/${id}`, { token: bob });
  assert.equal(b.status, 403);
  assert.equal(b.json.error.code, 'FORBIDDEN');
  mock.restoreAll();
});

test('S17. Certificate list: another userId -> 403, bad type -> 400, filter is the caller\'s', async () => {
  assert.equal((await call('GET', '/certificates?userId=bob-id', { token: alice })).status, 403);
  assert.equal((await call('GET', '/certificates?type=weird', { token: alice })).status, 400);

  const find = mock.method(Certificate, 'find', () => ({ sort: async () => [] }));
  const r = await call('GET', '/certificates?type=badge&tag=python', { token: alice });
  assert.equal(r.status, 200);
  assert.deepEqual(find.mock.calls[0].arguments[0], { userId: 'alice-id', type: 'badge', tags: 'python' });
  mock.restoreAll();
});

/* ------------------------------------------------------------------ */
/*  4. Injection, headers, CORS                                        */
/* ------------------------------------------------------------------ */
test('S18. NoSQL operator objects in login are rejected, never queried', async () => {
  const r = await call('POST', '/auth/login', { body: { email: { $gt: '' }, password: { $gt: '' } } });
  assert.ok([400].includes(r.status), `got ${r.status}`);
  assert.ok(['INVALID_INPUT', 'MISSING_FIELDS'].includes(r.json.error.code));
});

test('S19. Malformed JSON -> 400 INVALID_JSON (JSON, not an HTML stack trace)', async () => {
  const r = await call('POST', '/auth/login', { raw: '{"email": ', headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_JSON');
});

test('S20. Security headers are set and X-Powered-By is hidden', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('strict-transport-security'));
});

test('S21. CORS: configured origins get headers, others do not (and no 500)', async () => {
  const ok = await call('GET', '/health', { headers: { Origin: 'https://milestone.example.com' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://milestone.example.com');
  const dev = await call('GET', '/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(dev.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const evil = await call('GET', '/health', { headers: { Origin: 'https://evil.example.org' } });
  assert.equal(evil.status, 200);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('S22. Unknown routes answer JSON 404', async () => {
  const r = await call('GET', '/nope');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'ROUTE_NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/*  5. Quiz gate                                                       */
/* ------------------------------------------------------------------ */
function stubFundamentalsTopic({ complete, attempts }) {
  mock.method(Roadmap, 'findOne', () => ({ lean: async () => null }));
  mock.method(FundamentalsTopic, 'exists', async () => ({ _id: 'x' }));
  mock.method(FundamentalsProgress, 'findOne', () => ({
    lean: async () => (complete ? { status: 'completed' } : { status: 'in_progress' }),
  }));
  mock.method(QuizAttempt, 'find', () => ({ sort: () => ({ lean: async () => attempts }) }));
}

test('Q1. Status: an unfinished topic is blocked (TOPIC_NOT_COMPLETE)', async () => {
  stubFundamentalsTopic({ complete: false, attempts: [] });
  const r = await call('GET', '/quiz/status/big-o', { token: alice });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.status.blockedReason, 'TOPIC_NOT_COMPLETE');
  assert.equal(r.json.data.status.canAttempt, false);
  mock.restoreAll();
});

test('Q2. Status: a finished topic with no attempts can be taken', async () => {
  stubFundamentalsTopic({ complete: true, attempts: [] });
  const r = await call('GET', '/quiz/status/big-o', { token: alice });
  assert.equal(r.json.data.status.canAttempt, true);
  assert.equal(r.json.data.status.attemptsLeft, 3);
  mock.restoreAll();
});

test('Q3. Status: a failed attempt starts a 10-hour cooldown with an end time', async () => {
  const at = new Date(Date.now() - 2 * 3600 * 1000);
  stubFundamentalsTopic({ complete: true, attempts: [{ attemptNumber: 1, passed: false, attemptedAt: at }] });
  const r = await call('GET', '/quiz/status/big-o', { token: alice });
  const s = r.json.data.status;
  assert.equal(s.blockedReason, 'COOLDOWN_ACTIVE');
  assert.equal(s.attemptsLeft, 2);
  const hoursLeft = (new Date(s.cooldownEndsAt) - Date.now()) / 3600000;
  assert.ok(hoursLeft > 7.9 && hoursLeft < 8.1, `hoursLeft=${hoursLeft}`);
  mock.restoreAll();
});

test('Q4. Status: 3 failed attempts -> MAX_ATTEMPTS_REACHED; a pass -> ALREADY_PASSED', async () => {
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  stubFundamentalsTopic({ complete: true, attempts: [{ attemptNumber: 3, passed: false, attemptedAt: old }] });
  assert.equal((await call('GET', '/quiz/status/t', { token: alice })).json.data.status.blockedReason, 'MAX_ATTEMPTS_REACHED');
  mock.restoreAll();

  stubFundamentalsTopic({ complete: true, attempts: [{ attemptNumber: 1, passed: true, attemptedAt: old }] });
  const s = (await call('GET', '/quiz/status/t', { token: alice })).json.data.status;
  assert.equal(s.blockedReason, 'ALREADY_PASSED');
  assert.equal(s.passed, true);
  mock.restoreAll();
});

test('Q5. Generating a quiz for an unfinished topic is refused BEFORE any AI call', async () => {
  stubFundamentalsTopic({ complete: false, attempts: [] });
  const r = await call('POST', '/quiz/generate/big-o', { token: alice, body: {} });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'TOPIC_NOT_COMPLETE');
  mock.restoreAll();
});

test('Q6. A topic that is on neither the roadmap nor fundamentals -> 404 (no badge farming)', async () => {
  mock.method(Roadmap, 'findOne', () => ({ lean: async () => null }));
  mock.method(FundamentalsTopic, 'exists', async () => null);
  const r = await call('POST', '/quiz/generate/made-up-topic', { token: alice, body: {} });
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'TOPIC_NOT_FOUND');
  mock.restoreAll();
});

test('Q7. Submitting after a pass is refused (no duplicate badges)', async () => {
  const old = new Date(Date.now() - 48 * 3600 * 1000);
  stubFundamentalsTopic({ complete: true, attempts: [{ attemptNumber: 1, passed: true, attemptedAt: old }] });
  const r = await call('POST', '/quiz/submit', { token: alice, body: { quizId: 'q', topicId: 't', answers: [0] } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'ALREADY_PASSED');
  mock.restoreAll();
});

/* ------------------------------------------------------------------ */
/*  6. Fundamentals + skills                                           */
/* ------------------------------------------------------------------ */
test('F1. Students cannot self-verify a fundamentals topic', async () => {
  const r = await call('PATCH', '/fundamentals/task/big-o', { token: alice, body: { status: 'verified' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_STATUS');
});

test('F2. A verified fundamentals topic cannot be reset by the student', async () => {
  mock.method(FundamentalsProgress, 'findOne', () => ({ lean: async () => ({ status: 'verified' }) }));
  const r = await call('PATCH', '/fundamentals/task/big-o', { token: alice, body: { status: 'not_started' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'TOPIC_VERIFIED');
  mock.restoreAll();
});

test('K1. /skills/verify (internal) marks roadmap tasks verified', async () => {
  const roadmap = {
    days: [{ tasks: [{ id: 'py::0', topicId: 'py', status: 'completed' }, { id: 'sql::0', topicId: 'sql', status: 'completed' }] }],
    save: mock.fn(async () => {}),
  };
  mock.method(SkillProfile, 'findOne', async () => null);
  mock.method(SkillProfile, 'create', async (d) => d);
  mock.method(Roadmap, 'findOne', async () => roadmap);
  mock.method(FundamentalsTopic, 'exists', async () => null);
  const r = await call('PATCH', '/skills/verify', {
    headers: { 'x-internal-key': process.env.INTERNAL_API_KEY },
    body: { userId: 'alice-id', topicId: 'py' },
  });
  assert.equal(r.status, 200);
  assert.equal(roadmap.days[0].tasks[0].status, 'verified');
  assert.equal(roadmap.days[0].tasks[1].status, 'completed'); // other topics untouched
  assert.equal(roadmap.save.mock.callCount(), 1);
  mock.restoreAll();
});

test('K2. Skill gap ignores a client-claimed "verified" flag', async () => {
  const Role = require('../src/models/Role.model');
  const role = { topics: [{ id: 'a', prerequisiteTopicIds: [] }, { id: 'b', prerequisiteTopicIds: [] }] };
  mock.method(Role, 'findById', async () => role);
  mock.method(SkillProfile, 'findOne', () => ({ lean: async () => ({ skills: [] }) }));
  const roleId = '507f1f77bcf86cd799439013';
  const r = await call('POST', '/skills/gap', {
    token: alice,
    body: { targetRoleId: roleId, currentSkills: [{ topicId: 'a', proficiency: 'beginner', verified: true }] },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.gapTopicIds.sort(), ['a', 'b']); // "verified:true" from the client did nothing
  mock.restoreAll();
});

/* ------------------------------------------------------------------ */
/*  7. Pure helpers                                                    */
/* ------------------------------------------------------------------ */
test('U1. env validation catches the mistakes that broke deployment before', () => {
  const { validateEnv } = require('../src/config/env');
  const good = {
    NODE_ENV: 'production', DATABASE_URL: 'mongodb://x', JWT_SECRET: 'a'.repeat(40),
    INTERNAL_API_KEY: 'b'.repeat(40), FRONTEND_URL: 'https://app.example.com',
    LLM_API_KEY: 'k', CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's',
  };
  assert.equal(validateEnv(good).errors.length, 0);
  assert.ok(validateEnv({ ...good, JWT_SECRET: '' }).errors.some((e) => /JWT_SECRET/.test(e)));
  assert.ok(validateEnv({ ...good, JWT_SECRET: 'short' }).errors.some((e) => /JWT_SECRET/.test(e)));
  assert.ok(validateEnv({ ...good, INTERNAL_API_KEY: 'b'.repeat(31) }).errors.some((e) => /INTERNAL_API_KEY/.test(e)));
  assert.ok(validateEnv({ ...good, INTERNAL_API_KEY: good.JWT_SECRET }).errors.some((e) => /different/.test(e)));
  assert.ok(validateEnv({ ...good, FRONTEND_URL: 'https://app.example.com/path' }).errors.some((e) => /origin only/.test(e)));
  assert.ok(validateEnv({ ...good, FRONTEND_URL: '' }).errors.some((e) => /FRONTEND_URL/.test(e)));
  assert.ok(validateEnv({ ...good, LLM_PROVIDER: 'mock' }).errors.some((e) => /mock/.test(e)));
  assert.ok(validateEnv({ ...good, GOOGLE_CLIENT_ID: 'id' }).errors.some((e) => /GOOGLE_CLIENT_SECRET/.test(e)));
});

test('U2. INTERNAL_API_URL works with or without /api/v1', () => {
  const { internalOrigin, internalApiBase } = require('../src/utils/internalUrl');
  for (const v of ['https://api.x.com', 'https://api.x.com/', 'https://api.x.com/api/v1', 'https://api.x.com/api/v1/']) {
    process.env.INTERNAL_API_URL = v;
    assert.equal(internalOrigin(), 'https://api.x.com');
    assert.equal(internalApiBase(), 'https://api.x.com/api/v1');
  }
});

test('U3. File signatures: fake MIME types are caught', () => {
  const { matchesSignature } = require('../src/utils/fileSignature');
  assert.equal(matchesSignature(Buffer.from('%PDF-1.7 ...'), 'application/pdf'), true);
  assert.equal(matchesSignature(Buffer.from('<script>alert(1)</script>'), 'application/pdf'), false);
  assert.equal(matchesSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true);
  assert.equal(matchesSignature(Buffer.from('MZ-an-exe'), 'image/png'), false);
  assert.equal(matchesSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
});

test('U4. Token encryption round-trips and rejects tampering', () => {
  const { encrypt, decrypt } = require('../src/utils/crypto');
  const enc = encrypt('1//refresh-token');
  assert.notEqual(enc, '1//refresh-token');
  assert.equal(decrypt(enc), '1//refresh-token');
  const parts = enc.split('.');
  parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(parts.join('.')));
});

test('U5. Sheets callback page: bad state is shown as a friendly HTML page, XSS-safe', async () => {
  const res = await fetch(`${base}/applications/sheets/callback?code=abc&state=<script>alert(1)</script>`);
  const html = await res.text();
  assert.equal(res.status, 400);
  assert.ok(html.includes('Not connected'));
  assert.ok(!html.includes('<script>alert(1)'));
});

/* ------------------------------------------------------------------ */
/*  8. Google Sheets endpoints (no network, no database)               */
/* ------------------------------------------------------------------ */
const GoogleSheetsAuth = require('../src/models/GoogleSheetsAuth.model');

test('G2. Sheets not configured: status says so, connect -> 503 SHEETS_NOT_CONFIGURED', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  mock.method(GoogleSheetsAuth, 'exists', async () => null);
  const st = await call('GET', '/applications/sheets/status', { token: alice });
  assert.equal(st.status, 200);
  assert.deepEqual(st.json.data, { connected: false, configured: false });
  const c = await call('GET', '/applications/sheets/connect', { token: alice });
  assert.equal(c.status, 503);
  assert.equal(c.json.error.code, 'SHEETS_NOT_CONFIGURED');
  mock.restoreAll();
});

test('G3. Sheets configured: connect returns a Google URL with a signed, expiring state', async () => {
  process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_REDIRECT_URI = 'https://api.example.com/api/v1/auth/google/callback';
  const r = await call('GET', '/applications/sheets/connect', { token: alice });
  assert.equal(r.status, 200);
  const url = new URL(r.json.data.authUrl);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/spreadsheets');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://api.example.com/api/v1/applications/sheets/callback'
  );
  const state = require('jsonwebtoken').verify(url.searchParams.get('state'), process.env.JWT_SECRET);
  assert.equal(state.userId, 'alice-id');
  assert.equal(state.purpose, 'sheets');
  assert.ok(state.exp - state.iat <= 600);
});

test('G4. Sync without a stored connection -> 400 SHEETS_NOT_CONNECTED', async () => {
  mock.method(Application, 'find', () => ({ sort: () => ({ limit: async () => [] }) }));
  mock.method(GoogleSheetsAuth, 'findOne', async () => null);
  const r = await call('POST', '/applications/sync-sheets', { token: alice, body: {} });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'SHEETS_NOT_CONNECTED');
  mock.restoreAll();
});

test('G5. A login token cannot be replayed as a Sheets "state"', async () => {
  const res = await fetch(`${base}/applications/sheets/callback?code=abc&state=${alice}`);
  const html = await res.text();
  assert.equal(res.status, 400);
  assert.ok(html.includes('not valid') || html.includes('expired'));
});
