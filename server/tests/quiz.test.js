// server/tests/quiz.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Disable Mongoose buffering so unmocked operations fail immediately rather than waiting 10s
mongoose.set('bufferCommands', false);

const {
  scaleQuestionCount,
  buildQuizPrompt,
  validateQuizData,
  checkAttemptEligibility,
  submitQuizAttempt,
  generateOrGetQuiz,
  isTopicFullyCompleted,
  PASSING_SCORE,
  MAX_ATTEMPTS,
  COOLDOWN_HOURS,
} = require('../src/services/quiz.service');

const Quiz = require('../src/models/Quiz.model');
const QuizAttempt = require('../src/models/QuizAttempt.model');
const Role = require('../src/models/Role.model');
const Roadmap = require('../src/models/Roadmap.model');
const integrationService = require('../src/services/integration.service');
const llmService = require('../src/services/llm.service');

describe('Quiz System — Unit & Logic Tests', () => {

  describe('1. Question Count Scaling (15 to 20)', () => {
    test('scales to 15 questions for a small topic (<= 90 mins or <= 4 points)', () => {
      const smallTopic = {
        name: 'Quick Topic',
        outline: [
          { point: 'Concept 1', estimatedMinutes: 20 },
          { point: 'Concept 2', estimatedMinutes: 30 },
        ],
      };
      const count = scaleQuestionCount(smallTopic);
      assert.strictEqual(count, 15);
    });

    test('scales to 20 questions for a large topic (>= 240 mins or >= 8 points)', () => {
      const largeTopic = {
        name: 'Deep System Architecture',
        outline: Array.from({ length: 9 }, (_, i) => ({
          point: `Point ${i + 1}`,
          estimatedMinutes: 30,
        })),
      };
      const count = scaleQuestionCount(largeTopic);
      assert.strictEqual(count, 20);
    });

    test('scales between 15 and 20 for mid-sized topics', () => {
      const midTopic = {
        name: 'Mid-sized topic',
        outline: [
          { point: 'P1', estimatedMinutes: 35 },
          { point: 'P2', estimatedMinutes: 45 },
          { point: 'P3', estimatedMinutes: 40 },
          { point: 'P4', estimatedMinutes: 40 },
          { point: 'P5', estimatedMinutes: 40 },
        ], // 200 mins
      };
      const count = scaleQuestionCount(midTopic);
      assert.ok(count >= 15 && count <= 20);
    });
  });

  describe('2. Role-Personalized Quiz Prompt & Grounding', () => {
    const sampleTopic = {
      id: 'dsa-basics',
      name: 'Data Structures & Algorithms',
      track: 'Core CS',
      priority: 'core',
      outline: [
        { point: 'Array memory layout and indexing', type: 'conceptual', practicePrompt: 'Explain cache locality' },
        { point: 'Hash map collision resolution', type: 'practical', practicePrompt: 'Implement chaining' },
      ],
    };

    test('generates Data Analyst specific prompt with analytics emphasis', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic,
        roleName: 'Data Analyst',
        roleDescription: 'Analytics and Business Intelligence',
        questionCount: 15,
      });

      assert.ok(prompt.includes('TARGET ROLE: Data Analyst'));
      assert.ok(prompt.includes('EMPHASIS: Ground scenarios in data analytics, tabular reporting, SQL queries'));
      assert.ok(prompt.includes('Array memory layout and indexing'));
      assert.ok(prompt.includes('Hash map collision resolution'));
      assert.ok(system.includes('exactly 15 questions'));
    });

    test('generates Software Developer specific prompt with system/algorithm emphasis', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic,
        roleName: 'Software Developer',
        roleDescription: 'Full stack and backend engineering',
        questionCount: 18,
      });

      assert.ok(prompt.includes('TARGET ROLE: Software Developer'));
      assert.ok(prompt.includes('EMPHASIS: Ground scenarios in robust software development, application architecture'));
      assert.ok(system.includes('exactly 18 questions'));
    });

    test('generates AI Engineer specific prompt with ML pipeline emphasis', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic,
        roleName: 'AI Engineer',
        roleDescription: 'Machine learning and deep learning pipelines',
        questionCount: 20,
      });

      assert.ok(prompt.includes('TARGET ROLE: AI Engineer'));
      assert.ok(prompt.includes('EMPHASIS: Ground scenarios in machine learning workflows, tensor/vector manipulation'));
      assert.ok(system.includes('exactly 20 questions'));
    });

    test('prompts strictly ground questions in outline points and enforce 4 options', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic,
        roleName: 'Software Developer',
        questionCount: 15,
      });

      assert.ok(system.includes('STRICT GROUNDING RULES'));
      assert.ok(system.includes('Base all questions strictly on the provided TOPIC OUTLINE'));
      assert.ok(system.includes('Do NOT invent external, trivia, or unrelated knowledge'));
      assert.ok(system.includes('EXACTLY 4 plausible strings'));
    });

    test('prompt and system prompt include all 8 strict count and formatting constraints', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic,
        roleName: 'Software Developer',
        questionCount: 15,
      });

      // 1. Generate exactly 15 questions, or otherwise between 15 and 20
      assert.ok(system.includes('Generate exactly 15 questions, or otherwise a valid number between 15 and 20'));
      assert.ok(prompt.includes('Generate exactly 15 questions, or otherwise a valid number between 15 and 20'));

      // 2. Prefer exactly 15 for predictable generation
      assert.ok(system.includes('Prefer exactly 15 for predictable generation'));
      assert.ok(prompt.includes('Prefer exactly 15 for predictable generation'));

      // 3. Never return fewer than 15
      assert.ok(system.includes('Never return fewer than 15'));
      assert.ok(prompt.includes('Never return fewer than 15'));

      // 4. Never return more than 20
      assert.ok(system.includes('Never return more than 20'));
      assert.ok(prompt.includes('Never return more than 20'));

      // 5. Return exactly 4 options for every question
      assert.ok(system.includes('Return exactly 4 options for every question'));
      assert.ok(prompt.includes('Return exactly 4 options for every question'));

      // 6. correctOptionIndex must be an integer from 0 to 3
      assert.ok(system.includes('correctOptionIndex must be an integer from 0 to 3'));
      assert.ok(prompt.includes('correctOptionIndex must be an integer from 0 to 3'));

      // 7. Return only the expected JSON structure
      assert.ok(system.includes('Return only the expected JSON structure'));
      assert.ok(prompt.includes('Return only the expected JSON structure'));

      // 8. Do not add explanations or markdown outside the JSON
      assert.ok(system.includes('Do not add explanations or markdown outside the JSON'));
      assert.ok(prompt.includes('Do not add explanations or markdown outside the JSON'));
    });

    test('prompt instructs generating multiple distinct questions per outline point', () => {
      const { system, prompt } = buildQuizPrompt({
        topic: sampleTopic, // 2 outline points
        roleName: 'AI Engineer',
        questionCount: 15,
      });

      assert.ok(system.includes('The provided outline contains 2 points'));
      assert.ok(system.includes('distinct questions per outline point'));
      assert.ok(prompt.includes('TOPIC OUTLINE (2 points)'));
      assert.ok(prompt.includes('produce multiple distinct questions'));
    });

    test('verifies SAME topic (llm-fundamentals-pretrained-models) produces distinctly differentiated prompt contexts for AI Engineer, Software Developer, and Data Analyst', () => {
      const llmTopic = {
        id: 'llm-fundamentals-pretrained-models',
        name: 'LLM Fundamentals & Using Pre-trained Models',
        track: 'Tools/Libraries',
        priority: 'core',
        prerequisiteTopicIds: ['dl-nlp-transformer-fundamentals'],
        outline: [
          {
            point: 'Inference vs training: what happens when you call an LLM API',
            estimatedMinutes: 20,
            type: 'conceptual',
            source: 'docs',
            practicePrompt: 'Explain the difference between training and inference.',
          },
          {
            point: 'Making your first API call: the Chat Completions pattern',
            estimatedMinutes: 35,
            type: 'practical',
            source: 'docs',
            practicePrompt: 'Write a Python script that calls an LLM chat completion API.',
          },
          {
            point: 'Managing tokens and cost calculations',
            estimatedMinutes: 25,
            type: 'practical',
            source: 'docs',
            practicePrompt: 'Use a tokenizer library to count tokens.',
          },
        ],
      };

      const aiRole = {
        _id: '6aab768ea9aa1191ba01a5d7',
        name: 'AI Engineer',
        description: 'AI & Machine Learning Pathway',
        topics: [llmTopic],
      };

      const devRole = {
        _id: '6aa3d03d8615df48db962993',
        name: 'Software Developer',
        description: 'Software Engineering Pathway',
        topics: [
          { id: 'system-design-basics', name: 'System Design', track: 'Core CS', priority: 'core' },
        ],
      };

      const daRole = {
        _id: '6aa111222333444555666777',
        name: 'Data Analyst',
        description: 'Data Analytics Pathway',
        topics: [
          { id: 'pandas', name: 'Pandas', track: 'Tools/Libraries', priority: 'core' },
        ],
      };

      const aie = buildQuizPrompt({
        topic: llmTopic,
        role: aiRole,
        roleId: aiRole._id,
        roleName: aiRole.name,
        roleDescription: aiRole.description,
        questionCount: 15,
      });

      const sde = buildQuizPrompt({
        topic: llmTopic,
        role: devRole,
        roleId: devRole._id,
        roleName: devRole.name,
        roleDescription: devRole.description,
        questionCount: 15,
      });

      const da = buildQuizPrompt({
        topic: llmTopic,
        role: daRole,
        roleId: daRole._id,
        roleName: daRole.name,
        roleDescription: daRole.description,
        questionCount: 15,
      });

      // 1. Prompts for the SAME topic must NOT be identical across roles
      assert.notStrictEqual(aie.prompt, sde.prompt, 'AI Engineer and Software Developer prompts must differ');
      assert.notStrictEqual(sde.prompt, da.prompt, 'Software Developer and Data Analyst prompts must differ');
      assert.notStrictEqual(aie.prompt, da.prompt, 'AI Engineer and Data Analyst prompts must differ');

      // 2. Structured repository fields must be present in all prompts
      for (const p of [aie.prompt, sde.prompt, da.prompt]) {
        assert.ok(p.includes('TOPIC:\nllm-fundamentals-pretrained-models'));
        assert.ok(p.includes('TRACK:\nTools/Libraries'));
        assert.ok(p.includes('ROLE PRIORITY:\ncore'));
        assert.ok(p.includes('PREREQUISITE TOPICS:\ndl-nlp-transformer-fundamentals'));
        assert.ok(p.includes('ROLE-SPECIFIC TOPIC CONTEXT:'));
        assert.ok(p.includes('Curriculum practice scenario: "Write a Python script that calls an LLM chat completion API."'));
      }

      // 3. Software Developer specific context
      assert.ok(sde.prompt.includes('ROLE:\nSoftware Developer'));
      assert.ok(sde.prompt.includes('ROLE PERSPECTIVE (Software Developer)'));
      assert.ok(sde.prompt.includes('API Integration & Client Resilience'));
      assert.ok(sde.prompt.includes('429 rate limits'));
      assert.ok(sde.prompt.includes('Application Architecture'));

      // 4. AI Engineer specific context
      assert.ok(aie.prompt.includes('ROLE:\nAI Engineer'));
      assert.ok(aie.prompt.includes('ROLE PERSPECTIVE (AI Engineer)'));
      assert.ok(aie.prompt.includes('Model Inference & Sampling Dynamics'));
      assert.ok(aie.prompt.includes('temperature, top_p'));
      assert.ok(aie.prompt.includes('Hallucination Mechanics & Mitigation'));

      // 5. Data Analyst specific context
      assert.ok(da.prompt.includes('ROLE:\nData Analyst'));
      assert.ok(da.prompt.includes('ROLE PERSPECTIVE (Data Analyst)'));
      assert.ok(da.prompt.includes('Tabular & Unstructured Data Workflows'));
      assert.ok(da.prompt.includes('Output Verification & Analytical Factuality'));
      assert.ok(da.prompt.includes('token consumption and costs across large tabular batches'));
    });
  });

  describe('3. LLM Response Validation', () => {
    function makeValidQuestions(count = 15) {
      return Array.from({ length: count }, (_, i) => ({
        id: `q${i + 1}`,
        question: `What is the significance of outline concept ${i + 1}?`,
        options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
        correctOptionIndex: (i % 4),
      }));
    }

    test('accepts valid 15 questions output with 4 options each', () => {
      const valid = { questions: makeValidQuestions(15) };
      const validated = validateQuizData(valid, 15);
      assert.strictEqual(validated.length, 15);
      assert.strictEqual(validated[0].options.length, 4);
    });

    test('accepts valid 20 questions output with 4 options each', () => {
      const valid = { questions: makeValidQuestions(20) };
      const validated = validateQuizData(valid, 20);
      assert.strictEqual(validated.length, 20);
      assert.strictEqual(validated[19].options.length, 4);
    });

    test('rejects payload missing top-level questions array', () => {
      assert.throws(() => {
        validateQuizData({ notQuestions: [] });
      }, /missing top-level "questions" array/);
    });

    test('rejects quiz with exactly 8 questions (Groq failure case) with exact error message', () => {
      const invalid = { questions: makeValidQuestions(8) };
      assert.throws(
        () => {
          validateQuizData(invalid);
        },
        (err) => {
          assert.strictEqual(
            err.message,
            'Quiz questions count must be between 15 and 20. Received 8.'
          );
          return true;
        }
      );
    });

    test('rejects quiz with fewer than 15 questions', () => {
      const invalid = { questions: makeValidQuestions(10) };
      assert.throws(() => {
        validateQuizData(invalid);
      }, /must be between 15 and 20/);
    });

    test('rejects quiz with 21 questions with exact error message', () => {
      const invalid = { questions: makeValidQuestions(21) };
      assert.throws(
        () => {
          validateQuizData(invalid);
        },
        (err) => {
          assert.strictEqual(
            err.message,
            'Quiz questions count must be between 15 and 20. Received 21.'
          );
          return true;
        }
      );
    });

    test('rejects quiz with more than 20 questions', () => {
      const invalid = { questions: makeValidQuestions(22) };
      assert.throws(() => {
        validateQuizData(invalid);
      }, /must be between 15 and 20/);
    });

    test('rejects question with only 3 options', () => {
      const questions = makeValidQuestions(15);
      questions[3].options = ['Opt A', 'Opt B', 'Opt C']; // 3 options
      assert.throws(() => {
        validateQuizData({ questions });
      }, /must contain exactly 4 options/);
    });

    test('rejects question with 5 options', () => {
      const questions = makeValidQuestions(15);
      questions[2].options = ['Opt 1', 'Opt 2', 'Opt 3', 'Opt 4', 'Opt 5']; // 5 options
      assert.throws(() => {
        validateQuizData({ questions });
      }, /must contain exactly 4 options/);
    });

    test('rejects question with invalid correctOptionIndex (out of range: 4)', () => {
      const questions = makeValidQuestions(15);
      questions[2].correctOptionIndex = 4; // out of range 0..3
      assert.throws(() => {
        validateQuizData({ questions });
      }, /invalid correctOptionIndex/);
    });

    test('rejects question with negative correctOptionIndex (-1)', () => {
      const questions = makeValidQuestions(15);
      questions[2].correctOptionIndex = -1; // negative
      assert.throws(() => {
        validateQuizData({ questions });
      }, /invalid correctOptionIndex/);
    });

    test('rejects question with non-integer correctOptionIndex (1.5)', () => {
      const questions = makeValidQuestions(15);
      questions[2].correctOptionIndex = 1.5; // non-integer
      assert.throws(() => {
        validateQuizData({ questions });
      }, /invalid correctOptionIndex/);
    });

    test('rejects question with duplicate id', () => {
      const questions = makeValidQuestions(15);
      questions[5].id = questions[0].id; // duplicate
      assert.throws(() => {
        validateQuizData({ questions });
      }, /Duplicate question id/);
    });
  });

  describe('4. Quiz Scoring & Threshold Rules', () => {
    test('80% passes threshold', () => {
      const total = 20;
      const correct = 16; // 16/20 = 80%
      const score = Math.round((correct / total) * 100);
      const passed = score >= PASSING_SCORE;
      assert.strictEqual(score, 80);
      assert.strictEqual(passed, true);
    });

    test('79% fails threshold', () => {
      // e.g. 15 of 19 = 78.94% -> 79%
      const total = 19;
      const correct = 15;
      const score = Math.round((correct / total) * 100);
      const passed = score >= PASSING_SCORE;
      assert.strictEqual(score, 79);
      assert.strictEqual(passed, false);
    });

    test('100% passes', () => {
      const total = 15;
      const correct = 15;
      const score = Math.round((correct / total) * 100);
      assert.strictEqual(score, 100);
      assert.strictEqual(score >= PASSING_SCORE, true);
    });

    test('0% fails', () => {
      const total = 15;
      const correct = 0;
      const score = Math.round((correct / total) * 100);
      assert.strictEqual(score, 0);
      assert.strictEqual(score >= PASSING_SCORE, false);
    });
  });

  describe('5. Attempt Limits & Cooldown Logic', () => {
    test('allows attempt 1 when no previous attempt exists', async () => {
      const origFindOne = QuizAttempt.findOne;
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => null,
        }),
      });

      const res = await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
      assert.strictEqual(res.canAttempt, true);
      assert.strictEqual(res.nextAttemptNumber, 1);

      QuizAttempt.findOne = origFindOne;
    });

    test('allows attempt 2 when previous failed attempt cooldown has expired (> 10 hours)', async () => {
      const origFindOne = QuizAttempt.findOne;
      const elevenHoursAgo = new Date(Date.now() - 11 * 60 * 60 * 1000);
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => ({
            attemptNumber: 1,
            passed: false,
            attemptedAt: elevenHoursAgo,
          }),
        }),
      });

      const res = await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
      assert.strictEqual(res.canAttempt, true);
      assert.strictEqual(res.nextAttemptNumber, 2);

      QuizAttempt.findOne = origFindOne;
    });

    test('allows attempt 3 when previous failed attempt cooldown has expired (> 10 hours)', async () => {
      const origFindOne = QuizAttempt.findOne;
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => ({
            attemptNumber: 2,
            passed: false,
            attemptedAt: twelveHoursAgo,
          }),
        }),
      });

      const res = await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
      assert.strictEqual(res.canAttempt, true);
      assert.strictEqual(res.nextAttemptNumber, 3);

      QuizAttempt.findOne = origFindOne;
    });

    test('rejects attempt when 10-hour cooldown is active with COOLDOWN_ACTIVE and remaining hours', async () => {
      const origFindOne = QuizAttempt.findOne;
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 8 hours remaining
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => ({
            attemptNumber: 1,
            passed: false,
            attemptedAt: twoHoursAgo,
          }),
        }),
      });

      await assert.rejects(
        async () => {
          await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
        },
        (err) => {
          assert.strictEqual(err.code, 'COOLDOWN_ACTIVE');
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.message.includes('Please wait 8 more hour(s)'));
          return true;
        }
      );

      QuizAttempt.findOne = origFindOne;
    });

    test('rejects fourth attempt when max attempts reached with MAX_ATTEMPTS_REACHED', async () => {
      const origFindOne = QuizAttempt.findOne;
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => ({
            attemptNumber: 3,
            passed: false,
            attemptedAt: twentyHoursAgo,
          }),
        }),
      });

      await assert.rejects(
        async () => {
          await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
        },
        (err) => {
          assert.strictEqual(err.code, 'MAX_ATTEMPTS_REACHED');
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.message.includes('Maximum quiz attempts reached'));
          return true;
        }
      );

      QuizAttempt.findOne = origFindOne;
    });

    test('passing previous attempt is not blocked by failed-attempt cooldown', async () => {
      const origFindOne = QuizAttempt.findOne;
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => ({
            attemptNumber: 1,
            passed: true, // PASSED
            attemptedAt: oneHourAgo,
          }),
        }),
      });

      const res = await checkAttemptEligibility({ userId: 'test-user', topicId: 'dsa' });
      assert.strictEqual(res.canAttempt, true);
      assert.strictEqual(res.nextAttemptNumber, 2);

      QuizAttempt.findOne = origFindOne;
    });
  });

  describe('6. Submit Quiz Attempt & Cross-Module Integrations', () => {
    test('passing quiz (>=80%) triggers Person A skill verification and Person C badge', async () => {
      const origQuizFindById = Quiz.findById;
      const origAttemptFindOne = QuizAttempt.findOne;
      const origAttemptCreate = QuizAttempt.create;
      const origRoleFindOne = Role.findOne;
      const origVerifySkill = integrationService.verifySkillWithPersonA;
      const origIssueBadge = integrationService.issueBadgeWithPersonC;

      const mockQuestions = Array.from({ length: 15 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      Quiz.findById = () => ({
        lean: async () => ({
          _id: 'quiz-123',
          topicId: 'dbms-fundamentals',
          roleId: 'role-dev',
          questions: mockQuestions,
        }),
      });

      Role.findOne = () => ({
        lean: async () => ({
          name: 'Software Developer',
          topics: [{ id: 'dbms-fundamentals', name: 'DBMS & Database Concepts' }],
        }),
      });

      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => null, // first attempt
        }),
      });

      let savedAttemptData = null;
      QuizAttempt.create = async (doc) => {
        savedAttemptData = doc;
        return {
          toObject: () => ({ _id: 'attempt-456', ...doc }),
        };
      };

      let personACalled = false;
      let personCCalled = false;
      integrationService.verifySkillWithPersonA = async ({ userId, topicId }) => {
        assert.strictEqual(userId, 'dev-user-1');
        assert.strictEqual(topicId, 'dbms-fundamentals');
        personACalled = true;
        return { success: true };
      };

      integrationService.issueBadgeWithPersonC = async ({ userId, topicId, quizScore }) => {
        assert.strictEqual(userId, 'dev-user-1');
        assert.strictEqual(topicId, 'dbms-fundamentals');
        assert.strictEqual(quizScore, 100);
        personCCalled = true;
        return { success: true };
      };

      // All answers correct (index 0)
      const answers = Array(15).fill(0);
      const res = await submitQuizAttempt({
        userId: 'dev-user-1',
        quizId: 'quiz-123',
        topicId: 'dbms-fundamentals',
        answers,
      });

      assert.strictEqual(res.score, 100);
      assert.strictEqual(res.passed, true);
      assert.strictEqual(personACalled, true, 'Person A verifySkill MUST be called on pass');
      assert.strictEqual(personCCalled, true, 'Person C badge MUST be called on pass');
      assert.strictEqual(savedAttemptData.passed, true);
      assert.strictEqual(savedAttemptData.attemptNumber, 1);

      Quiz.findById = origQuizFindById;
      QuizAttempt.findOne = origAttemptFindOne;
      QuizAttempt.create = origAttemptCreate;
      Role.findOne = origRoleFindOne;
      integrationService.verifySkillWithPersonA = origVerifySkill;
      integrationService.issueBadgeWithPersonC = origIssueBadge;
    });

    test('failing quiz (<80%) does NOT call Person A or Person C', async () => {
      const origQuizFindById = Quiz.findById;
      const origAttemptFindOne = QuizAttempt.findOne;
      const origAttemptCreate = QuizAttempt.create;
      const origVerifySkill = integrationService.verifySkillWithPersonA;
      const origIssueBadge = integrationService.issueBadgeWithPersonC;

      const mockQuestions = Array.from({ length: 15 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      Quiz.findById = () => ({
        lean: async () => ({
          _id: 'quiz-123',
          topicId: 'dbms-fundamentals',
          roleId: 'role-dev',
          questions: mockQuestions,
        }),
      });

      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => null,
        }),
      });

      QuizAttempt.create = async (doc) => ({
        toObject: () => ({ _id: 'attempt-456', ...doc }),
      });

      let personACalled = false;
      let personCCalled = false;
      integrationService.verifySkillWithPersonA = async () => { personACalled = true; return { success: true }; };
      integrationService.issueBadgeWithPersonC = async () => { personCCalled = true; return { success: true }; };

      // 15 wrong answers (index 1 when correct is 0) -> 0%
      const answers = Array(15).fill(1);
      const res = await submitQuizAttempt({
        userId: 'dev-user-1',
        quizId: 'quiz-123',
        topicId: 'dbms-fundamentals',
        answers,
      });

      assert.strictEqual(res.score, 0);
      assert.strictEqual(res.passed, false);
      assert.strictEqual(personACalled, false, 'Person A verifySkill must NOT be called on fail');
      assert.strictEqual(personCCalled, false, 'Person C badge must NOT be called on fail');
      assert.strictEqual(res.wrongQuestionIndices.length, 15);

      Quiz.findById = origQuizFindById;
      QuizAttempt.findOne = origAttemptFindOne;
      QuizAttempt.create = origAttemptCreate;
      integrationService.verifySkillWithPersonA = origVerifySkill;
      integrationService.issueBadgeWithPersonC = origIssueBadge;
    });

    test('external integration failure does not corrupt or throw out a passed attempt', async () => {
      const origQuizFindById = Quiz.findById;
      const origAttemptFindOne = QuizAttempt.findOne;
      const origAttemptCreate = QuizAttempt.create;
      const origRoleFindOne = Role.findOne;
      const origVerifySkill = integrationService.verifySkillWithPersonA;
      const origIssueBadge = integrationService.issueBadgeWithPersonC;

      const mockQuestions = Array.from({ length: 15 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      Quiz.findById = () => ({
        lean: async () => ({
          _id: 'quiz-123',
          topicId: 'dbms-fundamentals',
          roleId: 'role-dev',
          questions: mockQuestions,
        }),
      });

      Role.findOne = () => ({
        lean: async () => ({
          name: 'Software Developer',
          topics: [{ id: 'dbms-fundamentals', name: 'DBMS & Database Concepts' }],
        }),
      });

      QuizAttempt.findOne = () => ({
        sort: () => ({
          lean: async () => null,
        }),
      });

      QuizAttempt.create = async (doc) => ({
        toObject: () => ({ _id: 'attempt-456', ...doc }),
      });

      // Person C is down or pending
      integrationService.verifySkillWithPersonA = async () => ({ success: true });
      integrationService.issueBadgeWithPersonC = async () => ({ success: false, error: { code: 'DEPENDENCY_PENDING' } });

      const answers = Array(15).fill(0);
      const res = await submitQuizAttempt({
        userId: 'dev-user-1',
        quizId: 'quiz-123',
        topicId: 'dbms-fundamentals',
        answers,
      });

      assert.strictEqual(res.passed, true);
      assert.strictEqual(res.attempt.passed, true);
      assert.strictEqual(res.integrationResults.badgeIssued, false);

      Quiz.findById = origQuizFindById;
      QuizAttempt.findOne = origAttemptFindOne;
      QuizAttempt.create = origAttemptCreate;
      Role.findOne = origRoleFindOne;
      integrationService.verifySkillWithPersonA = origVerifySkill;
      integrationService.issueBadgeWithPersonC = origIssueBadge;
    });
  });

  describe('7. Quiz Generation, Caching & Non-Eligible Topic Rejection', () => {
    test('rejects non-quizEligible topic with TOPIC_NOT_QUIZ_ELIGIBLE', async () => {
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-sde',
          name: 'Software Developer',
          topics: [
            {
              id: 'git-version-control',
              name: 'Git Version Control',
              quizEligible: false, // NON-ELIGIBLE
            },
          ],
        }),
      });

      await assert.rejects(
        async () => {
          await generateOrGetQuiz({ topicId: 'git-version-control', roleName: 'Software Developer' });
        },
        (err) => {
          assert.strictEqual(err.code, 'TOPIC_NOT_QUIZ_ELIGIBLE');
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );

      Role.findOne = origRoleFindOne;
      Roadmap.findOne = origRoadmapFindOne;
    });

    test('rejects nonexistent topic with TOPIC_NOT_FOUND', async () => {
      const origRoleFindOne = Role.findOne;
      const origRoleFind = Role.find;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findOne = () => ({ lean: async () => null });
      Role.find = () => ({ lean: async () => [] });

      await assert.rejects(
        async () => {
          await generateOrGetQuiz({ topicId: 'totally-nonexistent-topic-xyz' });
        },
        (err) => {
          assert.strictEqual(err.code, 'TOPIC_NOT_FOUND');
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );

      Role.findOne = origRoleFindOne;
      Role.find = origRoleFind;
      Roadmap.findOne = origRoadmapFindOne;
    });

    test('returns cached quiz without calling LLM when quiz already exists', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origRoleFindById = Role.findById;
      const origRoadmapFindOne = Roadmap.findOne;
      const origCallLLM = llmService.callLLM;
      let llmCalled = false;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findById = () => ({
        lean: async () => ({
          _id: 'role-da',
          name: 'Data Analyst',
          topics: [{ id: 'numpy', name: 'NumPy', quizEligible: true, outline: [] }],
        }),
      });

      Quiz.findOne = () => ({
        lean: async () => ({
          _id: 'cached-quiz-1',
          topicId: 'numpy',
          roleId: 'role-da',
          roleName: 'Data Analyst',
          questions: Array(15).fill({ id: 'q1', question: 'Q', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 0 }),
          questionCount: 15,
        }),
      });

      llmService.callLLM = async () => {
        llmCalled = true;
        return '{}';
      };

      const res = await generateOrGetQuiz({
        topicId: 'numpy',
        roleId: 'role-da',
        roleName: 'Data Analyst',
      });

      assert.strictEqual(res.cached, true);
      assert.strictEqual(res.quiz._id, 'cached-quiz-1');
      assert.strictEqual(llmCalled, false, 'LLM must NOT be called when cached quiz exists');

      Quiz.findOne = origQuizFindOne;
      Role.findById = origRoleFindById;
      Roadmap.findOne = origRoadmapFindOne;
      llmService.callLLM = origCallLLM;
    });

    test('isolates cached quiz by role context (Data Analyst vs Software Developer)', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origRoleFindById = Role.findById;
      const origRoadmapFindOne = Roadmap.findOne;

      Roadmap.findOne = () => ({ lean: async () => null });
      Role.findById = (id) => ({
        lean: async () => ({
          _id: id,
          name: id === 'role-da' ? 'Data Analyst' : 'Software Developer',
          topics: [{ id: 'dbms-fundamentals', name: 'DBMS', quizEligible: true, outline: [] }],
        }),
      });

      Quiz.findOne = (query) => ({
        lean: async () => {
          if (query.roleId === 'role-da') {
            return { _id: 'quiz-data-analyst', topicId: 'dbms-fundamentals', roleId: 'role-da' };
          }
          return null; // not cached for dev
        },
      });

      // 1. Data Analyst request returns Quiz A
      const resDA = await generateOrGetQuiz({
        topicId: 'dbms-fundamentals',
        roleId: 'role-da',
        roleName: 'Data Analyst',
      });
      assert.strictEqual(resDA.cached, true);
      assert.strictEqual(resDA.quiz._id, 'quiz-data-analyst');

      Quiz.findOne = origQuizFindOne;
      Role.findById = origRoleFindById;
      Roadmap.findOne = origRoadmapFindOne;
    });

    test('verifies role-specific context reaches LLM prompt for Data Analyst, Software Developer, and AI Engineer on shared DSA', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origQuizCreate = Quiz.create;
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;
      const origCallLLM = llmService.callLLM;

      Roadmap.findOne = () => ({ lean: async () => null });
      Quiz.findOne = () => ({ lean: async () => null }); // never cached upfront
      Quiz.create = async (doc) => ({ toObject: () => ({ _id: `quiz-${doc.roleId}`, ...doc }) });

      const promptsCaptured = {};
      llmService.callLLM = async ({ prompt, system }) => {
        const roleMatch = prompt.match(/TARGET ROLE:\s*([^\n]+)/);
        const role = roleMatch ? roleMatch[1].trim() : 'unknown';
        promptsCaptured[role] = prompt;
        return JSON.stringify({
          questions: Array.from({ length: 15 }, (_, i) => ({
            id: `q${i + 1}`,
            question: `Question ${i + 1} for ${role}`,
            options: ['A', 'B', 'C', 'D'],
            correctOptionIndex: 0,
          })),
        });
      };

      const dsaTopic = {
        id: 'dsa-fundamentals',
        name: 'Data Structures & Algorithms',
        track: 'Core CS',
        priority: 'core',
        quizEligible: true,
        outline: [
          { point: 'Arrays, hashing and memory layout', type: 'conceptual' },
          { point: 'Search and traversal algorithms', type: 'practical' },
        ],
      };

      // Test Role 1: Data Analyst + DSA
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-da',
          name: 'Data Analyst',
          description: 'Data Analytics & Insights',
          topics: [dsaTopic],
        }),
      });

      const daResult = await generateOrGetQuiz({
        topicId: 'dsa-fundamentals',
        roleName: 'Data Analyst',
      });
      assert.strictEqual(daResult.cached, false);
      assert.ok(promptsCaptured['Data Analyst']);
      assert.ok(promptsCaptured['Data Analyst'].includes('TARGET ROLE: Data Analyst'));
      assert.ok(promptsCaptured['Data Analyst'].includes('tabular reporting, SQL queries'));

      // Test Role 2: Software Developer + DSA
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-sde',
          name: 'Software Developer',
          description: 'Full-stack software engineering',
          topics: [dsaTopic],
        }),
      });

      const sdeResult = await generateOrGetQuiz({
        topicId: 'dsa-fundamentals',
        roleName: 'Software Developer',
      });
      assert.strictEqual(sdeResult.cached, false);
      assert.ok(promptsCaptured['Software Developer']);
      assert.ok(promptsCaptured['Software Developer'].includes('TARGET ROLE: Software Developer'));
      assert.ok(promptsCaptured['Software Developer'].includes('robust software development, application architecture'));

      // Test Role 3: AI Engineer + DSA
      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-aie',
          name: 'AI Engineer',
          description: 'Machine learning & AI engineering',
          topics: [dsaTopic],
        }),
      });

      const aieResult = await generateOrGetQuiz({
        topicId: 'dsa-fundamentals',
        roleName: 'AI Engineer',
      });
      assert.strictEqual(aieResult.cached, false);
      assert.ok(promptsCaptured['AI Engineer']);
      assert.ok(promptsCaptured['AI Engineer'].includes('TARGET ROLE: AI Engineer'));
      assert.ok(promptsCaptured['AI Engineer'].includes('machine learning workflows, tensor/vector manipulation'));

      Quiz.findOne = origQuizFindOne;
      Quiz.create = origQuizCreate;
      Role.findOne = origRoleFindOne;
      llmService.callLLM = origCallLLM;
    });

    test('generateOrGetQuiz handles Groq returning 8 questions by rejecting with QUIZ_GENERATION_FAILED without persisting any quiz to DB', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origQuizCreate = Quiz.create;
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;
      const origCallLLM = llmService.callLLM;

      let quizCreateCalled = false;
      Roadmap.findOne = () => ({ lean: async () => null });
      Quiz.findOne = () => ({ lean: async () => null });
      Quiz.create = async () => {
        quizCreateCalled = true;
        throw new Error('Quiz.create should NOT be called on invalid quiz!');
      };

      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-aie',
          name: 'AI Engineer',
          topics: [
            {
              id: 'llm-fundamentals-pretrained-models',
              name: 'LLM Fundamentals & Using Pre-trained Models',
              quizEligible: true,
              outline: [{ point: 'Point 1' }],
            },
          ],
        }),
      });

      // Mock Groq returning exactly 8 questions (the user's real failure case)
      const mock8Questions = Array.from({ length: 8 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Groq Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      llmService.callLLM = async () => JSON.stringify({ questions: mock8Questions });

      await assert.rejects(
        async () => {
          await generateOrGetQuiz({
            topicId: 'llm-fundamentals-pretrained-models',
            roleName: 'AI Engineer',
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 502);
          assert.strictEqual(err.code, 'QUIZ_GENERATION_FAILED');
          assert.strictEqual(
            err.message,
            'Generated quiz failed structure validation: Quiz questions count must be between 15 and 20. Received 8.'
          );
          return true;
        }
      );

      assert.strictEqual(quizCreateCalled, false, 'No quiz must be saved to the database on failure');

      Quiz.findOne = origQuizFindOne;
      Quiz.create = origQuizCreate;
      Role.findOne = origRoleFindOne;
      Roadmap.findOne = origRoadmapFindOne;
      llmService.callLLM = origCallLLM;
    });

    test('generateOrGetQuiz succeeds and persists quiz when LLM returns 15 valid questions', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origQuizCreate = Quiz.create;
      const origRoleFindOne = Role.findOne;
      const origRoadmapFindOne = Roadmap.findOne;
      const origCallLLM = llmService.callLLM;

      let savedQuizDoc = null;
      Roadmap.findOne = () => ({ lean: async () => null });
      Quiz.findOne = () => ({ lean: async () => null });
      Quiz.create = async (doc) => {
        savedQuizDoc = doc;
        return {
          toObject: () => ({ _id: 'new-quiz-id', ...doc }),
        };
      };

      Role.findOne = () => ({
        lean: async () => ({
          _id: 'role-aie',
          name: 'AI Engineer',
          topics: [
            {
              id: 'llm-fundamentals-pretrained-models',
              name: 'LLM Fundamentals & Using Pre-trained Models',
              quizEligible: true,
              outline: [{ point: 'Point 1' }],
            },
          ],
        }),
      });

      const mock15Questions = Array.from({ length: 15 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Valid Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
      }));

      llmService.callLLM = async () => JSON.stringify({ questions: mock15Questions });

      const result = await generateOrGetQuiz({
        topicId: 'llm-fundamentals-pretrained-models',
        roleName: 'AI Engineer',
      });

      assert.strictEqual(result.cached, false);
      assert.strictEqual(result.quiz.questions.length, 15);
      assert.strictEqual(result.quiz.questionCount, 15);
      assert.ok(savedQuizDoc);
      assert.strictEqual(savedQuizDoc.questions.length, 15);

      Quiz.findOne = origQuizFindOne;
      Quiz.create = origQuizCreate;
      Role.findOne = origRoleFindOne;
      Roadmap.findOne = origRoadmapFindOne;
      llmService.callLLM = origCallLLM;
    });

    test('isolates cached quizzes independently across AI Engineer, Software Developer, and Data Analyst for the exact same topic', async () => {
      const origQuizFindOne = Quiz.findOne;
      const origQuizCreate = Quiz.create;
      const origRoleFindOne = Role.findOne;
      const origRoleFindById = Role.findById;
      const origRoadmapFindOne = Roadmap.findOne;
      const origCallLLM = llmService.callLLM;

      Roadmap.findOne = () => ({ lean: async () => null });

      const topicId = 'llm-fundamentals-pretrained-models';

      const mockRoles = {
        '6aab768ea9aa1191ba01a5d7': {
          _id: '6aab768ea9aa1191ba01a5d7',
          name: 'AI Engineer',
          topics: [{ id: topicId, name: 'LLM Fundamentals', quizEligible: true, outline: [{ point: 'P1' }] }],
        },
        '6aa3d03d8615df48db962993': {
          _id: '6aa3d03d8615df48db962993',
          name: 'Software Developer',
          topics: [{ id: 'other-topic', name: 'Other', quizEligible: true, outline: [{ point: 'P1' }] }],
        },
        '6aa111222333444555666777': {
          _id: '6aa111222333444555666777',
          name: 'Data Analyst',
          topics: [{ id: 'other-topic', name: 'Other', quizEligible: true, outline: [{ point: 'P1' }] }],
        },
      };

      Role.findOne = (query) => ({
        lean: async () => {
          if (query.name) {
            const role = Object.values(mockRoles).find(r => query.name.test(r.name));
            return role || null;
          }
          if (query['topics.id']) {
            return mockRoles['6aab768ea9aa1191ba01a5d7'];
          }
          return null;
        },
      });

      Role.findById = (id) => ({
        lean: async () => mockRoles[id] || null,
      });

      // In-memory quiz store keyed by `${topicId}::${roleId}`
      const quizCacheStore = new Map();

      Quiz.findOne = (query) => ({
        lean: async () => {
          const key = `${query.topicId}::${query.roleId}`;
          return quizCacheStore.get(key) || null;
        },
      });

      Quiz.create = async (doc) => {
        const key = `${doc.topicId}::${doc.roleId}`;
        const stored = { _id: `quiz-doc-${doc.roleId}`, ...doc };
        quizCacheStore.set(key, stored);
        return {
          toObject: () => stored,
        };
      };

      let llmCallCount = 0;
      llmService.callLLM = async () => {
        llmCallCount++;
        return JSON.stringify({
          questions: Array.from({ length: 15 }, (_, i) => ({
            id: `q${i + 1}`,
            question: `Question ${i + 1}`,
            options: ['A', 'B', 'C', 'D'],
            correctOptionIndex: 0,
          })),
        });
      };

      // 1. Generate quiz for AI Engineer (roleId: 6aab768ea9aa1191ba01a5d7)
      const resAIE = await generateOrGetQuiz({
        topicId,
        roleId: '6aab768ea9aa1191ba01a5d7',
      });
      assert.strictEqual(resAIE.cached, false);
      assert.strictEqual(resAIE.quiz.roleId, '6aab768ea9aa1191ba01a5d7');
      assert.strictEqual(llmCallCount, 1);

      // 2. Request for Software Developer (roleId: 6aa3d03d8615df48db962993) on SAME topic
      // MUST NOT return the AI Engineer quiz!
      const resSDE = await generateOrGetQuiz({
        topicId,
        roleId: '6aa3d03d8615df48db962993',
      });
      assert.strictEqual(resSDE.cached, false, 'Software Developer quiz must NOT hit AI Engineer cache');
      assert.strictEqual(resSDE.quiz.roleId, '6aa3d03d8615df48db962993');
      assert.notStrictEqual(resSDE.quiz._id, resAIE.quiz._id, 'Quiz IDs must differ across roles');
      assert.strictEqual(llmCallCount, 2);

      // 3. Request for Software Developer AGAIN on SAME topic
      // MUST return the cached Software Developer quiz WITHOUT calling LLM
      const resSDERetry = await generateOrGetQuiz({
        topicId,
        roleId: '6aa3d03d8615df48db962993',
      });
      assert.strictEqual(resSDERetry.cached, true, 'Subsequent SDE request must return from cache');
      assert.strictEqual(resSDERetry.quiz._id, resSDE.quiz._id);
      assert.strictEqual(llmCallCount, 2, 'LLM must NOT be called on cached hit');

      // 4. Request for Data Analyst on SAME topic
      // MUST NOT return AI Engineer or Software Developer quiz; must generate its own
      const resDA = await generateOrGetQuiz({
        topicId,
        roleId: '6aa111222333444555666777',
      });
      assert.strictEqual(resDA.cached, false, 'Data Analyst quiz must NOT hit SDE or AIE cache');
      assert.strictEqual(resDA.quiz.roleId, '6aa111222333444555666777');
      assert.notStrictEqual(resDA.quiz._id, resAIE.quiz._id);
      assert.notStrictEqual(resDA.quiz._id, resSDE.quiz._id);
      assert.strictEqual(llmCallCount, 3);

      // 5. Request for AI Engineer AGAIN on SAME topic
      // MUST return original AI Engineer cached quiz
      const resAIERetry = await generateOrGetQuiz({
        topicId,
        roleId: '6aab768ea9aa1191ba01a5d7',
      });
      assert.strictEqual(resAIERetry.cached, true, 'Subsequent AIE request must return from cache');
      assert.strictEqual(resAIERetry.quiz._id, resAIE.quiz._id);
      assert.strictEqual(llmCallCount, 3, 'LLM must NOT be called on cached hit');

      Quiz.findOne = origQuizFindOne;
      Quiz.create = origQuizCreate;
      Role.findOne = origRoleFindOne;
      Role.findById = origRoleFindById;
      Roadmap.findOne = origRoadmapFindOne;
      llmService.callLLM = origCallLLM;
    });
  });

  describe('8. Topic Completion Verification Helper', () => {
    test('returns false when roadmap tasks for topic are incomplete', async () => {
      const origRoadmapFindOne = Roadmap.findOne;
      const origRoleFindById = Role.findById;

      Roadmap.findOne = () => ({
        lean: async () => ({
          targetRoleId: 'role-sde',
          days: [
            {
              tasks: [
                { id: 'dsa-topic::0', topicId: 'dsa-topic', status: 'completed' },
                { id: 'dsa-topic::1', topicId: 'dsa-topic', status: 'not_started' },
              ],
            },
          ],
        }),
      });

      Role.findById = () => ({
        lean: async () => ({
          topics: [
            {
              id: 'dsa-topic',
              outline: [{ point: 'P1' }, { point: 'P2' }], // 2 points required
            },
          ],
        }),
      });

      const isComplete = await isTopicFullyCompleted('dev-user-1', 'dsa-topic');
      assert.strictEqual(isComplete, false);

      Roadmap.findOne = origRoadmapFindOne;
      Role.findById = origRoleFindById;
    });

    test('returns true when all outline chunks for topic are completed or verified', async () => {
      const origRoadmapFindOne = Roadmap.findOne;
      const origRoleFindById = Role.findById;

      Roadmap.findOne = () => ({
        lean: async () => ({
          targetRoleId: 'role-sde',
          days: [
            {
              tasks: [
                { id: 'dsa-topic::0', topicId: 'dsa-topic', status: 'completed' },
                { id: 'dsa-topic::1', topicId: 'dsa-topic', status: 'verified' },
              ],
            },
          ],
        }),
      });

      Role.findById = () => ({
        lean: async () => ({
          topics: [
            {
              id: 'dsa-topic',
              outline: [{ point: 'P1' }, { point: 'P2' }],
            },
          ],
        }),
      });

      const isComplete = await isTopicFullyCompleted('dev-user-1', 'dsa-topic');
      assert.strictEqual(isComplete, true);

      Roadmap.findOne = origRoadmapFindOne;
      Role.findById = origRoleFindById;
    });
  });
});
