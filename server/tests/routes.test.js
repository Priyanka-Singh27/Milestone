const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Disable Mongoose buffering so unmocked operations fail fast rather than hanging 10s
mongoose.set('bufferCommands', false);

const TEST_SECRET = 'routes-test-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_SECRET;
const authToken = jwt.sign(
  { userId: 'dev-user-1', email: 'dev-user-1@test.com' },
  process.env.JWT_SECRET
);

const app = require('../src/app');
const Quiz = require('../src/models/Quiz.model');
const QuizAttempt = require('../src/models/QuizAttempt.model');
const Role = require('../src/models/Role.model');
const Roadmap = require('../src/models/Roadmap.model');
const { FundamentalsTopic, FundamentalsProgress } = require('../src/models/Fundamentals.model');
const { DEFAULT_CURRICULUM } = require('../src/services/fundamentals.service');

function authFetch(url, options = {}) {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${authToken}`,
  };
  return fetch(url, { ...options, headers });
}

describe('Person B HTTP Routes Integration Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Start temporary in-process HTTP server on random available port
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        process.env.INTERNAL_API_URL = baseUrl;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('POST /api/v1/quiz/generate/:topicId', () => {
    test('returns 401 NO_TOKEN when authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/v1/quiz/generate/dbms-fundamentals`, {
        method: 'POST',
      });
      const body = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'NO_TOKEN');
    });

    test('returns 200 with standard { success: true, data: { quiz } } shape when topic is cached', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-dev',
          name: 'Software Developer',
          topics: [
            { id: 'dbms-fundamentals', name: 'DBMS & Database Concepts', quizEligible: true, outline: [] },
          ],
        }),
      });

      Quiz.findOne = () => ({
        lean: async () => ({
          _id: 'quiz-abc',
          topicId: 'dbms-fundamentals',
          roleId: 'role-dev',
          roleName: 'Software Developer',
          questions: Array.from({ length: 15 }, (_, i) => ({
            id: `q${i + 1}`,
            question: `Question ${i + 1}`,
            options: ['A', 'B', 'C', 'D'],
            correctOptionIndex: 0,
          })),
          questionCount: 15,
        }),
      });

      const res = await authFetch(`${baseUrl}/api/v1/quiz/generate/dbms-fundamentals`, {
        method: 'POST',
      });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.success, true);
      assert.ok(body.data && body.data.quiz);
      assert.strictEqual(body.data.quiz.topicId, 'dbms-fundamentals');
      assert.strictEqual(body.data.quiz.questions.length, 15);

      Quiz.findOne = origQuizFindOne;
      Role.findOne = origRoleFindOne;
      Roadmap.findOne = origRoadmapFindOne;
    });

    test('returns 400 with TOPIC_NOT_QUIZ_ELIGIBLE when topic has quizEligible: false', async () => {
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-dev',
          name: 'Software Developer',
          topics: [
            { id: 'git-version-control', name: 'Git Version Control', quizEligible: false },
          ],
        }),
      });

      const res = await authFetch(`${baseUrl}/api/v1/quiz/generate/git-version-control`, {
        method: 'POST',
      });
      const body = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'TOPIC_NOT_QUIZ_ELIGIBLE');
      assert.ok(body.error.message.includes('not designated as quiz-eligible'));

      Role.findOne = origRoleFindOne;
      Roadmap.findOne = origRoadmapFindOne;
    });

    test('returns 404 with TOPIC_NOT_FOUND when topic does not exist', async () => {
      const origRoleFindOne = Role.findOne;
      const origRoleFind = Role.find;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findOne = () => ({ lean: async () => null });
      Role.find = () => ({ lean: async () => [] });

      const res = await authFetch(`${baseUrl}/api/v1/quiz/generate/non-existent-topic-404`, {
        method: 'POST',
      });
      const body = await res.json();

      assert.strictEqual(res.status, 404);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'TOPIC_NOT_FOUND');

      Role.findOne = origRoleFindOne;
      Role.find = origRoleFind;
      Roadmap.findOne = origRoadmapFindOne;
    });
  });

  describe('POST /api/v1/quiz/submit', () => {
    test('returns 200 with { success: true, data: { attempt, score, passed } } on valid submission', async () => {
      const origQuizFindById = Quiz.findById;
      const origAttemptFindOne = QuizAttempt.findOne;
      const origAttemptCreate = QuizAttempt.create;
      const origRoleFindOne = Role.findOne;

      Role.findOne = () => ({
        lean: async () => ({
          name: 'Software Developer',
          topics: [{ id: 'dsa-basics', name: 'DSA Basics' }],
        }),
      });

      const mockQuestions = Array.from({ length: 15 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      Quiz.findById = () => ({
        lean: async () => ({
          _id: 'quiz-test-1',
          topicId: 'dsa-basics',
          roleId: 'general',
          questions: mockQuestions,
        }),
      });

      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => null,
        }),
      });

      QuizAttempt.create = async (doc) => ({
        toObject: () => ({ _id: 'attempt-test-1', ...doc }),
      });

      const res = await authFetch(`${baseUrl}/api/v1/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'dev-user-1',
          quizId: 'quiz-test-1',
          topicId: 'dsa-basics',
          answers: Array(15).fill(0), // 100% score
        }),
      });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.score, 100);
      assert.strictEqual(body.data.passed, true);
      assert.strictEqual(body.data.attempt.attemptNumber, 1);

      Quiz.findById = origQuizFindById;
      QuizAttempt.findOne = origAttemptFindOne;
      QuizAttempt.create = origAttemptCreate;
      Role.findOne = origRoleFindOne;
    });

    test('returns 400 when answer count does not match quiz question count', async () => {
      const origQuizFindById = Quiz.findById;
      Quiz.findById = () => ({
        lean: async () => ({
          _id: 'quiz-test-1',
          topicId: 'dsa-basics',
          questions: Array(15).fill({ id: 'q', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 }),
        }),
      });

      const res = await authFetch(`${baseUrl}/api/v1/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'dev-user-1',
          quizId: 'quiz-test-1',
          topicId: 'dsa-basics',
          answers: [0, 1, 2], // Only 3 answers instead of 15
        }),
      });
      const body = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'INVALID_ANSWERS');

      Quiz.findById = origQuizFindById;
    });
  });

  describe('GET /api/v1/fundamentals', () => {
    test('returns 401 NO_TOKEN when authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/v1/fundamentals`);
      const body = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'NO_TOKEN');
    });

    test('returns 200 with all 5 areas and user progress', async () => {
      const origTopicFind = FundamentalsTopic.find;
      const origProgressFind = FundamentalsProgress.find;

      FundamentalsTopic.find = () => ({
        lean: async () => DEFAULT_CURRICULUM,
      });

      FundamentalsProgress.find = () => ({
        lean: async () => [
          { userId: 'dev-user-1', topicId: 'dsa-arrays-strings', status: 'completed' },
        ],
      });

      const res = await authFetch(`${baseUrl}/api/v1/fundamentals`);
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.success, true);
      assert.ok(Array.isArray(body.data.areas));
      assert.strictEqual(body.data.areas.length, 5);

      FundamentalsTopic.find = origTopicFind;
      FundamentalsProgress.find = origProgressFind;
    });
  });

  describe('PATCH /api/v1/fundamentals/task/:topicId', () => {
    test('returns 200 with updated progress on valid status', async () => {
      const origTopicFindOne = FundamentalsTopic.findOne;
      const origProgressUpdate = FundamentalsProgress.findOneAndUpdate;

      FundamentalsTopic.findOne = async () => ({ id: 'dsa-arrays-strings' });
      FundamentalsProgress.findOneAndUpdate = async (query, update) => ({
        userId: query.userId,
        topicId: query.topicId,
        status: update.status,
      });

      const res = await authFetch(`${baseUrl}/api/v1/fundamentals/task/dsa-arrays-strings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'dev-user-1',
          status: 'completed',
        }),
      });
      const body = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.progress.status, 'completed');

      FundamentalsTopic.findOne = origTopicFindOne;
      FundamentalsProgress.findOneAndUpdate = origProgressUpdate;
    });

    test('returns 400 on invalid status', async () => {
      const res = await authFetch(`${baseUrl}/api/v1/fundamentals/task/dsa-arrays-strings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'dev-user-1',
          status: 'invalid_status_xyz',
        }),
      });
      const body = await res.json();

      assert.strictEqual(res.status, 400);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error.code, 'INVALID_STATUS');
    });
  });
});
