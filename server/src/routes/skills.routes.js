// server/src/routes/skills.routes.js

const express = require('express');
const router = express.Router();
const { getSkillGap, verifySkill } = require('../controllers/skills.controller');

router.post('/gap', getSkillGap);
router.patch('/verify', verifySkill);

module.exports = router;