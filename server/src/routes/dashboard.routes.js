// server/src/routes/dashboard.routes.js

const express = require('express');
const router  = express.Router();

const { requireAuth }  = require('../middleware/auth.middleware');
const { getDashboard } = require('../controllers/dashboard.controller');

router.get('/', requireAuth, getDashboard);

module.exports = router;
