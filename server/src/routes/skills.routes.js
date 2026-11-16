// server/src/routes/skills.routes.js

const express = require('express');
const router = express.Router();

const {
  getSkillGap,
  getVerifiedSkills,
  verifySkill,
  extractSkills,
} = require('../controllers/skills.controller');
const { requireAuth, requireInternal } = require('../middleware/auth.middleware');
const { handleResumeUpload } = require('../middleware/upload.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');

// Students (logged in)
router.post('/gap', requireAuth, getSkillGap);
router.get('/verified', requireAuth, getVerifiedSkills);
router.post('/extract', requireAuth, expensiveLimiter, handleResumeUpload, extractSkills);

// INTERNAL ONLY. Called by the quiz module after a pass, with the internal key.
// A student's own token is rejected here, so nobody can verify a skill by hand.
router.patch('/verify', requireInternal, verifySkill);

module.exports = router;
