// server/src/controllers/quiz.controller.js

const {
  generateOrGetQuiz,
  submitQuizAttempt,
  isTopicFullyCompleted,
} = require('../services/quiz.service');
const { getQuizStatus, checkQuizAccess } = require('../services/quizGate.service');

function sendBlocked(res, blocked) {
  return res.status(blocked.statusCode).json({
    success: false,
    error: { code: blocked.code, message: blocked.message },
    // handy for the UI: attempts left, cooldown end, etc.
    data: { status: blocked.status },
  });
}

/**
 * POST /api/v1/quiz/generate/:topicId
 * Generates a quiz or returns the cached quiz for the specified topic and role context.
 *
 * Important: correct answers and explanations must never be sent before submission.
 */
async function generateQuiz(req, res) {
  try {
    const { topicId } = req.params;
    const userId = req.user.userId;

    // Block quizzes for unfinished topics / used-up attempts BEFORE spending an AI call.
    const blocked = await checkQuizAccess(userId, topicId);
    if (blocked) return sendBlocked(res, blocked);

    const roleId = req.body?.roleId || req.query?.roleId;
    const roleName =
      req.body?.role ||
      req.body?.roleName ||
      req.query?.role ||
      req.query?.roleName;

    const result = await generateOrGetQuiz({
      topicId,
      userId,
      roleId,
      roleName,
    });

    // Send only the public question fields.
    // Never expose correctOptionIndex or explanation before submission.
    const safeQuiz = {
      ...result.quiz,
      questions: result.quiz.questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
      })),
    };

    return res.status(200).json({
      success: true,
      data: {
        quiz: safeQuiz,
      },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred.';

    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}

/**
 * POST /api/v1/quiz/submit
 * Submits answers, calculates the score, verifies attempts/cooldown,
 * and triggers Person A & Person C integrations on a pass.
 *
 * Correct answers and explanations are returned only after submission.
 */
async function submitQuiz(req, res) {
  try {
    const { quizId, topicId, answers } = req.body;

    const userId = req.user.userId;

    if (typeof topicId === 'string') {
      const blocked = await checkQuizAccess(userId, topicId);
      if (blocked) return sendBlocked(res, blocked);
    }

    const result = await submitQuizAttempt({
      userId,
      quizId,
      topicId,
      answers,
    });

    return res.status(200).json({
      success: true,
      data: {
        attempt: result.attempt,
        score: result.score,
        passed: result.passed,
        wrongQuestionIndices: result.wrongQuestionIndices,
        feedback: result.feedback,
      },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred.';

    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
      },
    });
  }
}

/**
 * GET /api/v1/quiz/availability/:topicId
 * Checks whether all tasks for a topic are complete and the quiz is available.
 */
async function checkQuizAvailability(req, res) {
  try {
    const { topicId } = req.params;

    const userId = req.user.userId;

    const isComplete = await isTopicFullyCompleted(userId, topicId);

    return res.status(200).json({
      success: true,
      data: {
        topicId,
        isComplete,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: err.message,
      },
    });
  }
}

/**
 * GET /api/v1/quiz/status/:topicId
 * Everything the UI needs to decide what to show on a topic's quiz button.
 */
async function getQuizStatusHandler(req, res) {
  try {
    const status = await getQuizStatus(req.user.userId, req.params.topicId);
    return res.status(200).json({ success: true, data: { status } });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  }
}

module.exports = {
  getQuizStatusHandler,
  generateQuiz,
  submitQuiz,
  checkQuizAvailability,
};