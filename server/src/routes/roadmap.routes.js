// server/src/routes/roadmap.routes.js
//
// Every roadmap route requires a login. The user is ALWAYS the one in the token;
// a userId in the body or path must match it or the request is refused (FORBIDDEN).

const express = require('express');
const router = express.Router();

const {
  estimateRoadmap,
  generateRoadmap,
  getRoadmap,
  updateTaskStatus,
} = require('../controllers/roadmap.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');

router.use(requireAuth);

router.post('/estimate', estimateRoadmap);                    // onboarding: "how long will this take?"
router.post('/generate', expensiveLimiter, generateRoadmap);  // creates the roadmap + first window (AI calls)
router.get('/:userId', getRoadmap);                           // fetch (auto-extends / rolls over)
router.patch('/task/:taskId', updateTaskStatus);

module.exports = router;
