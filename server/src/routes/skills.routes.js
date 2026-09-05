const express = require('express');
const router = express.Router();
const { getSkillGap } = require('../controllers/skills.controller');

router.post('/gap', getSkillGap);

module.exports = router;