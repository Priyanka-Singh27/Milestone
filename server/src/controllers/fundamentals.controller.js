// server/src/controllers/fundamentals.controller.js

const {
  getFundamentalsCurriculum,
  updateFundamentalsProgress,
} = require('../services/fundamentals.service');

/**
 * GET /api/v1/fundamentals?userId=...
 * Lists the fixed CS Fundamentals curriculum (DSA, OOP, OS, DBMS, CN) with user progress
 */
async function getFundamentals(req, res) {
  try {
    const userId = req.user?.userId || req.query.userId || 'dev-user-1';
    const result = await getFundamentalsCurriculum(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'SERVER_ERROR';
    const message = err.message || 'Failed to retrieve fundamentals curriculum.';

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
    const userId = req.user?.userId || req.body.userId || 'dev-user-1';

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'status is required.' },
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
    const message = err.message || 'Failed to update fundamentals progress.';

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
