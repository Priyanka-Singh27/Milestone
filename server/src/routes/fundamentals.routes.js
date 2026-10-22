// server/src/routes/fundamentals.routes.js

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const {
  getFundamentals,
  updateFundamentalsTask,
} = require('../controllers/fundamentals.controller');

// GET /api/v1/fundamentals
router.get('/', requireAuth, getFundamentals);

// PATCH /api/v1/fundamentals/task/:topicId
router.patch('/task/:topicId', requireAuth, updateFundamentalsTask);

module.exports = router;
