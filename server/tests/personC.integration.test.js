// Person C integration tests: Application Tracker + Certificate Vault.
// Uses an in-memory MongoDB (mongodb-memory-server), so it never touches
// the shared Atlas database. Mounts only Person C's two routers, so it does
// not depend on the rest of app.js. Cloudinary is not called: only the
// paths that fail before an upload happens are exercised here.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api/v1/applications', require('../src/routes/applications.routes'));
  app.use('/api/v1/certificates', require('../src/routes/certificates.routes'));

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongod.stop();
});

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

let applicationId;
let badgeId;

test('A1. POST /applications with a custom status -> 201, status kept as typed', async () => {
  const { status, json } = await call('POST', '/applications', {
    company: 'Test Co',
    role: 'SDE Intern',
    status: 'Referral Pending',
  });
  assert.equal(status, 201);
  assert.equal(json.success, true);
  assert.equal(json.data.application.status, 'Referral Pending');
  assert.equal(json.data.application.userId, 'dev-user-1');
  applicationId = json.data.application._id;
});

test('A2. POST /applications without company -> 400 VALIDATION_ERROR', async () => {
  const { status, json } = await call('POST', '/applications', { role: 'SDE Intern' });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

test('A3. GET /applications lists it, and the status filter works', async () => {
  const all = await call('GET', '/applications?userId=dev-user-1');
  assert.equal(all.status, 200);
  assert.equal(all.json.data.applications.length, 1);

  const match = await call('GET', '/applications?userId=dev-user-1&status=Referral%20Pending');
  assert.equal(match.json.data.applications.length, 1);

  const none = await call('GET', '/applications?userId=dev-user-1&status=Offer');
  assert.equal(none.json.data.applications.length, 0);
});

test('A4. PATCH /applications/:id changes only the fields sent', async () => {
  const { status, json } = await call('PATCH', `/applications/${applicationId}`, { notes: 'updated' });
  assert.equal(status, 200);
  assert.equal(json.data.application.notes, 'updated');
  assert.equal(json.data.application.status, 'Referral Pending');
  assert.equal(json.data.application.company, 'Test Co');
});

test('A5. Malformed id -> 400 INVALID_ID on PATCH and DELETE', async () => {
  const patch = await call('PATCH', '/applications/abc123', { notes: 'x' });
  assert.equal(patch.status, 400);
  assert.equal(patch.json.error.code, 'INVALID_ID');
  const del = await call('DELETE', '/applications/abc123');
  assert.equal(del.status, 400);
  assert.equal(del.json.error.code, 'INVALID_ID');
});

test('A6. DELETE removes it, a second DELETE -> 404 NOT_FOUND', async () => {
  const first = await call('DELETE', `/applications/${applicationId}`);
  assert.equal(first.status, 200);
  const second = await call('DELETE', `/applications/${applicationId}`);
  assert.equal(second.status, 404);
  assert.equal(second.json.error.code, 'NOT_FOUND');
});

test('C1. POST /certificates/badge with the exact body Person B sends -> 201', async () => {
  const { status, json } = await call('POST', '/certificates/badge', {
    userId: 'dev-user-1',
    topicId: 'sql-fundamentals',
    title: 'SQL Fundamentals',
    quizScore: 95,
  });
  assert.equal(status, 201);
  assert.equal(json.success, true);
  const cert = json.data.certificate;
  assert.equal(cert.type, 'badge');
  assert.equal(cert.issuer, 'Platform-verified');
  assert.equal(cert.fileUrl, null);
  assert.equal(cert.quizScore, 95);
  badgeId = cert._id;
});

test('C2. Badge without title -> 400 VALIDATION_ERROR as JSON', async () => {
  const { status, json } = await call('POST', '/certificates/badge', { userId: 'dev-user-1', quizScore: 90 });
  assert.equal(status, 400);
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});

test('C3. GET /certificates filters by type', async () => {
  const badges = await call('GET', '/certificates?userId=dev-user-1&type=badge');
  assert.equal(badges.json.data.certificates.length, 1);
  const uploaded = await call('GET', '/certificates?userId=dev-user-1&type=uploaded');
  assert.equal(uploaded.json.data.certificates.length, 0);
});

test('C4. Badges cannot be deleted -> 403 FORBIDDEN', async () => {
  const { status, json } = await call('DELETE', `/certificates/${badgeId}`);
  assert.equal(status, 403);
  assert.equal(json.error.code, 'FORBIDDEN');
});

test('C5. DELETE /certificates with a malformed id -> 400 INVALID_ID', async () => {
  const { status, json } = await call('DELETE', '/certificates/abc123');
  assert.equal(status, 400);
  assert.equal(json.error.code, 'INVALID_ID');
});

test('C6. Upload with a disallowed file type -> 400 INVALID_FILE_TYPE', async () => {
  const form = new FormData();
  form.append('file', new Blob(['x'], { type: 'application/x-msdownload' }), 'a.exe');
  form.append('title', 't');
  form.append('issuer', 'i');
  const res = await fetch(`${base}/certificates/upload`, { method: 'POST', body: form });
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.equal(json.error.code, 'INVALID_FILE_TYPE');
});

test('C7. Upload with no file -> 400 VALIDATION_ERROR', async () => {
  const form = new FormData();
  form.append('title', 't');
  form.append('issuer', 'i');
  const res = await fetch(`${base}/certificates/upload`, { method: 'POST', body: form });
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.equal(json.error.code, 'VALIDATION_ERROR');
});
