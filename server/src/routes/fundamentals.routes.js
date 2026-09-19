// server/src/routes/fundamentals.routes.js

const express = require('express');
const router = express.Router();
const {
  getFundamentals,
  updateFundamentalsTask,
} = require('../controllers/fundamentals.controller');

// GET /api/v1/fundamentals
router.get('/', getFundamentals);

// PATCH /api/v1/fundamentals/task/:topicId
router.patch('/task/:topicId', updateFundamentalsTask);

module.exports = router;
