// server/src/routes/skills.routes.js
 
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const { getSkillGap, verifySkill, extractSkills } = require('../controllers/skills.controller');
 
router.post('/gap', getSkillGap);
router.patch('/verify', verifySkill);
router.post('/extract', upload.single('resume'), extractSkills);
 
module.exports = router;