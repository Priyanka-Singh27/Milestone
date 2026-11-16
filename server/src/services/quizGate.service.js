// server/src/services/quizGate.service.js
//
// Decides whether a student may take a topic's quiz, and reports their attempt
// state. Mirrors the rules in quiz.service.js (cooldown, max attempts) without
// throwing, so the UI can show them BEFORE the student answers 15+ questions.

const Roadmap = require('../models/Roadmap.model');
const Role = require('../models/Role.model');
const QuizAttempt = require('../models/QuizAttempt.model');
const { FundamentalsTopic, FundamentalsProgress } = require('../models/Fundamentals.model');
const {
  COOLDOWN_HOURS,
  MAX_ATTEMPTS,
  PASSING_SCORE,
  isTopicFullyCompleted,
} = require('./quiz.service');

/**
 * Where does this topic belong for this student?
 *  - 'roadmap'      a topic of the role on their roadmap
 *  - 'fundamentals' a CS-fundamentals topic
 *  - null           neither: no quiz may be taken (stops badge farming)
 */
async function locateTopic(userId, topicId) {
  const roadmap = await Roadmap.findOne({ userId }).lean();
  if (roadmap) {
    const role = await Role.findById(roadmap.targetRoleId).lean().catch(() => null);
    if (role && (role.topics || []).some((t) => t.id === topicId)) return 'roadmap';
  }
  if (await FundamentalsTopic.exists({ id: topicId })) return 'fundamentals';
  return null;
}

async function isComplete(userId, topicId, source) {
  if (source === 'roadmap') return isTopicFullyCompleted(userId, topicId);
  if (source === 'fundamentals') {
    const p = await FundamentalsProgress.findOne({ userId, topicId }).lean();
    return Boolean(p && (p.status === 'completed' || p.status === 'verified'));
  }
  return false;
}

async function getQuizStatus(userId, topicId) {
  const source = await locateTopic(userId, topicId);
  const base = {
    topicId,
    source,
    maxAttempts: MAX_ATTEMPTS,
    passingScore: PASSING_SCORE,
    cooldownHours: COOLDOWN_HOURS,
  };

  if (!source) {
    return {
      ...base, isComplete: false, passed: false, attemptsUsed: 0, attemptsLeft: 0,
      canAttempt: false, cooldownEndsAt: null, blockedReason: 'TOPIC_NOT_FOUND',
    };
  }

  const [complete, attempts] = await Promise.all([
    isComplete(userId, topicId, source),
    QuizAttempt.find({ userId, topicId }).sort({ attemptedAt: -1 }).lean(),
  ]);

  const last = attempts[0] || null;
  const passed = attempts.some((a) => a.passed === true);
  const attemptsUsed = last ? last.attemptNumber : 0;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

  let blockedReason = null;
  let cooldownEndsAt = null;

  if (!complete) {
    blockedReason = 'TOPIC_NOT_COMPLETE';
  } else if (passed) {
    blockedReason = 'ALREADY_PASSED';
  } else if (last && last.attemptNumber >= MAX_ATTEMPTS) {
    blockedReason = 'MAX_ATTEMPTS_REACHED';
  } else if (last) {
    const endsAt = new Date(last.attemptedAt).getTime() + COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Date.now() < endsAt) {
      blockedReason = 'COOLDOWN_ACTIVE';
      cooldownEndsAt = new Date(endsAt).toISOString();
    }
  }

  return {
    ...base,
    isComplete: complete,
    passed,
    attemptsUsed,
    attemptsLeft,
    canAttempt: blockedReason === null,
    cooldownEndsAt,
    blockedReason,
  };
}

const BLOCK_MESSAGES = {
  TOPIC_NOT_FOUND: [404, 'That topic is not part of your roadmap or the fundamentals curriculum.'],
  TOPIC_NOT_COMPLETE: [403, 'Finish every lesson of this topic before taking its quiz.'],
  ALREADY_PASSED: [409, 'You already passed this quiz and earned the badge.'],
  MAX_ATTEMPTS_REACHED: [400, 'Maximum quiz attempts reached for this topic.'],
  COOLDOWN_ACTIVE: [400, 'Please wait before retrying this quiz.'],
};

/** Express-friendly guard: returns an error descriptor or null. */
async function checkQuizAccess(userId, topicId) {
  const status = await getQuizStatus(userId, topicId);
  if (status.canAttempt) return null;
  const [statusCode, message] = BLOCK_MESSAGES[status.blockedReason] || [403, 'This quiz is not available.'];
  return { statusCode, code: status.blockedReason, message, status };
}

module.exports = { getQuizStatus, checkQuizAccess, locateTopic };
