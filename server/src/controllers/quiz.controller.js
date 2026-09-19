// server/src/controllers/quiz.controller.js

const {
  generateOrGetQuiz,
  submitQuizAttempt,
  isTopicFullyCompleted,
} = require('../services/quiz.service');

/**
 * POST /api/v1/quiz/generate/:topicId
 * Generates a quiz or returns the cached quiz for the specified topic and role context
 */
async function generateQuiz(req, res) {
  try {
    const { topicId } = req.params;
    const userId = req.user?.userId || req.body?.userId || req.query?.userId || 'dev-user-1';
    const roleId = req.body?.roleId || req.query?.roleId;
    const roleName = req.body?.role || req.body?.roleName || req.query?.role || req.query?.roleName;

    const result = await generateOrGetQuiz({
      topicId,
      userId,
      roleId,
      roleName,
    });

    return res.status(200).json({
      success: true,
      data: {
        quiz: result.quiz,
      },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred.';

    return res.status(statusCode).json({
      success: false,
      error: { code, message },
    });
  }
}

/**
 * POST /api/v1/quiz/submit
 * Submits answers for a quiz, computes score, verifies attempts/cooldown,
 * and triggers Person A & Person C cross-module integrations on pass
 */
async function submitQuiz(req, res) {
  try {
    const { quizId, topicId, answers } = req.body;
    const userId = req.user?.userId || req.body.userId || 'dev-user-1';

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
      },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred.';

    return res.status(statusCode).json({
      success: false,
      error: { code, message },
    });
  }
}

/**
 * GET /api/v1/quiz/availability/:topicId
 * Helper endpoint to check if all tasks for a topic are complete and quiz is available
 */
async function checkQuizAvailability(req, res) {
  try {
    const { topicId } = req.params;
    const userId = req.user?.userId || req.query.userId || 'dev-user-1';

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
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
}

module.exports = {
  generateQuiz,
  submitQuiz,
  checkQuizAvailability,
};
