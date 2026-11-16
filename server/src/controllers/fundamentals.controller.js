// server/src/controllers/fundamentals.controller.js

const {
  getFundamentalsCurriculum,
  updateFundamentalsProgress,
} = require('../services/fundamentals.service');
const { FundamentalsProgress } = require('../models/Fundamentals.model');
const { safeMessage } = require('../utils/safeError');

// 'verified' is awarded only by passing the topic's quiz, never set by hand.
const USER_SETTABLE_STATUSES = ['not_started', 'in_progress', 'completed'];

/**
 * GET /api/v1/fundamentals?userId=...
 * Lists the fixed CS Fundamentals curriculum (DSA, OOP, OS, DBMS, CN) with user progress
 */
async function getFundamentals(req, res) {
  try {
    const userId = req.user.userId;
    const result = await getFundamentalsCurriculum(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.statusCode ? err.message : safeMessage(err);

    return res.status(statusCode).json({
      success: false,
      error: { code, message },
    });
  }
}

/**
 * PATCH /api/v1/fundamentals/task/:topicId
 * Updates the completion status for a fundamentals topic
 */
async function updateFundamentalsTask(req, res) {
  try {
    const { topicId } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'status is required.' },
      });
    }

    if (!USER_SETTABLE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Invalid status. Allowed values: ${USER_SETTABLE_STATUSES.join(', ')}`,
        },
      });
    }

    const existing = await FundamentalsProgress.findOne({ userId, topicId }).lean();
    if (existing && existing.status === 'verified') {
      return res.status(409).json({
        success: false,
        error: { code: 'TOPIC_VERIFIED', message: 'This topic is quiz-verified and can no longer be changed.' },
      });
    }

    const progress = await updateFundamentalsProgress({ userId, topicId, status });

    return res.status(200).json({
      success: true,
      data: { progress },
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.statusCode ? err.message : safeMessage(err);

    return res.status(statusCode).json({
      success: false,
      error: { code, message },
    });
  }
}

module.exports = {
  getFundamentals,
  updateFundamentalsTask,
};
