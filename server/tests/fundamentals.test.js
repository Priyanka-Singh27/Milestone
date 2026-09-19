// server/tests/fundamentals.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  FIXED_AREAS,
  DEFAULT_CURRICULUM,
  getFundamentalsCurriculum,
  updateFundamentalsProgress,
} = require('../src/services/fundamentals.service');

const { FundamentalsTopic, FundamentalsProgress } = require('../src/models/Fundamentals.model');

describe('CS Fundamentals — Unit & Service Tests', () => {

  describe('1. Fixed Curriculum Structure', () => {
    test('contains all 5 mandatory areas in fixed order (DSA, OOP, OS, DBMS, CN)', () => {
      assert.deepStrictEqual(FIXED_AREAS, ['DSA', 'OOP', 'OS', 'DBMS', 'CN']);
    });

    test('every default topic has id, area, name, description, quizEligible, capstone, and outline', () => {
      assert.ok(DEFAULT_CURRICULUM.length >= 10);
      DEFAULT_CURRICULUM.forEach(topic => {
        assert.ok(topic.id, `Topic missing id: ${JSON.stringify(topic)}`);
        assert.ok(FIXED_AREAS.includes(topic.area), `Invalid area in topic: ${topic.area}`);
        assert.ok(topic.name, `Topic missing name: ${topic.id}`);
        assert.ok(topic.description, `Topic missing description: ${topic.id}`);
        assert.strictEqual(topic.quizEligible, true, `Topic should be quizEligible: ${topic.id}`);
        assert.ok(topic.capstoneProjectSuggestion, `Topic missing capstone suggestion: ${topic.id}`);
        assert.ok(Array.isArray(topic.outline) && topic.outline.length > 0, `Topic missing outline: ${topic.id}`);
      });
    });

    test('has topics representing each of the 5 areas', () => {
      FIXED_AREAS.forEach(area => {
        const matching = DEFAULT_CURRICULUM.filter(t => t.area === area);
        assert.ok(matching.length >= 2, `Expected at least 2 topics for area ${area}, found ${matching.length}`);
      });
    });
  });

  describe('2. getFundamentalsCurriculum', () => {
    test('returns areas array grouped by area with merged user progress', async () => {
      const origTopicFind = FundamentalsTopic.find;
      const origProgressFind = FundamentalsProgress.find;

      FundamentalsTopic.find = () => ({
        lean: async () => DEFAULT_CURRICULUM,
      });

      FundamentalsProgress.find = () => ({
        lean: async () => [
          { userId: 'dev-user-1', topicId: 'dsa-arrays-strings', status: 'completed' },
          { userId: 'dev-user-1', topicId: 'os-processes-threads', status: 'in_progress' },
        ],
      });

      const { areas } = await getFundamentalsCurriculum('dev-user-1');
      assert.strictEqual(areas.length, 5);
      assert.strictEqual(areas[0].area, 'DSA');

      // Check DSA progress
      const dsaProgress = areas[0].progress;
      const arraysProg = dsaProgress.find(p => p.topicId === 'dsa-arrays-strings');
      assert.ok(arraysProg);
      assert.strictEqual(arraysProg.status, 'completed');

      // Check uncompleted topic default status
      const unstartedProg = dsaProgress.find(p => p.topicId === 'dsa-trees-graphs');
      assert.ok(unstartedProg);
      assert.strictEqual(unstartedProg.status, 'not_started');

      FundamentalsTopic.find = origTopicFind;
      FundamentalsProgress.find = origProgressFind;
    });
  });

  describe('3. updateFundamentalsProgress', () => {
    test('updates status to in_progress or completed', async () => {
      const origTopicFindOne = FundamentalsTopic.findOne;
      const origProgressUpdate = FundamentalsProgress.findOneAndUpdate;

      FundamentalsTopic.findOne = async () => ({ id: 'dsa-arrays-strings' });
      FundamentalsProgress.findOneAndUpdate = async (query, update) => ({
        userId: query.userId,
        topicId: query.topicId,
        status: update.status,
      });

      const res = await updateFundamentalsProgress({
        userId: 'dev-user-1',
        topicId: 'dsa-arrays-strings',
        status: 'completed',
      });

      assert.strictEqual(res.topicId, 'dsa-arrays-strings');
      assert.strictEqual(res.status, 'completed');

      FundamentalsTopic.findOne = origTopicFindOne;
      FundamentalsProgress.findOneAndUpdate = origProgressUpdate;
    });

    test('rejects invalid status with 400 INVALID_STATUS', async () => {
      await assert.rejects(
        async () => {
          await updateFundamentalsProgress({
            userId: 'dev-user-1',
            topicId: 'dsa-arrays-strings',
            status: 'random_bad_status',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_STATUS');
          return true;
        }
      );
    });

    test('rejects nonexistent topic with 404 TOPIC_NOT_FOUND', async () => {
      const origTopicFindOne = FundamentalsTopic.findOne;
      FundamentalsTopic.findOne = async () => null;

      await assert.rejects(
        async () => {
          await updateFundamentalsProgress({
            userId: 'dev-user-1',
            topicId: 'nonexistent-topic-id',
            status: 'completed',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, 'TOPIC_NOT_FOUND');
          return true;
        }
      );

      FundamentalsTopic.findOne = origTopicFindOne;
    });
  });
});
