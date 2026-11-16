// server/src/routes/quiz.routes.js

const express = require('express');

const { requireAuth } = require('../middleware/auth.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');
const {
  generateQuiz,
  submitQuiz,
  checkQuizAvailability,
  getQuizStatusHandler,
} = require('../controllers/quiz.controller');

const router = express.Router();

router.use(requireAuth);

// Generate (or fetch the cached) quiz for a topic. Calls the AI, so rate-limited.
router.post('/generate/:topicId', expensiveLimiter, generateQuiz);

// Submit answers.
router.post('/submit', submitQuiz);

// Are all lessons of this topic done?
router.get('/availability/:topicId', checkQuizAvailability);

// Attempts used/left, cooldown end, passed, and why a quiz is blocked.
router.get('/status/:topicId', getQuizStatusHandler);

module.exports = router;
