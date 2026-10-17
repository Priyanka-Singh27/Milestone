// server/src/routes/roadmap.routes.js

const express = require('express');
const router = express.Router();
const {
  estimateRoadmap,
  generateRoadmap,
  getRoadmap,
  updateTaskStatus,
} = require('../controllers/roadmap.controller');

// NOTE: add the shared auth middleware here once it exists, e.g.:
// const authMiddleware = require('../middleware/auth.middleware');
// router.use(authMiddleware);

router.post('/estimate', estimateRoadmap);   // onboarding: "how long will this take?"
router.post('/generate', generateRoadmap);   // creates the roadmap + first window
router.get('/:userId', getRoadmap);          // fetch (auto-extends if running low)
router.patch('/task/:taskId', updateTaskStatus);

module.exports = router;