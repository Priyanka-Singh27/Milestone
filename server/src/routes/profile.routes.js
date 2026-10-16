// server/src/routes/profile.routes.js

const express = require('express');
const router  = express.Router();

const { requireAuth }             = require('../middleware/auth.middleware');
const { getProfile, updateProfile } = require('../controllers/profile.controller');

router.get('/',   requireAuth, getProfile);
router.patch('/', requireAuth, updateProfile);

module.exports = router;
