// server/src/routes/quiz.routes.js

const express = require('express');
const router = express.Router();
const {
  generateQuiz,
  submitQuiz,
  checkQuizAvailability,
} = require('../controllers/quiz.controller');

// POST /api/v1/quiz/generate/:topicId
router.post('/generate/:topicId', generateQuiz);

// POST /api/v1/quiz/submit
router.post('/submit', submitQuiz);

// Optional helper: GET /api/v1/quiz/availability/:topicId
router.get('/availability/:topicId', checkQuizAvailability);

module.exports = router;
