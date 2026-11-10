// server/src/routes/quiz.routes.js

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const {
  generateQuiz,
  submitQuiz,
  checkQuizAvailability,
} = require('../controllers/quiz.controller');

// POST /api/v1/quiz/generate/:topicId
router.post('/generate/:topicId', requireAuth, generateQuiz);

// POST /api/v1/quiz/submit
router.post('/submit', requireAuth, submitQuiz);

// GET /api/v1/quiz/availability/:topicId
router.get('/availability/:topicId', requireAuth, checkQuizAvailability);

module.exports = router;
