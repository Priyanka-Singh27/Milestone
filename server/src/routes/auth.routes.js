// server/src/routes/auth.routes.js

const express = require('express');
const router  = express.Router();
const cookieParser = require('cookie-parser');

const {
  signup,
  login,
  googleStart,
  googleCallback,
} = require('../controllers/auth.controller');

// cookie-parser needed for the Google OAuth state cookie
router.use(cookieParser());

router.post('/signup',           signup);
router.post('/login',            login);
router.get('/google',            googleStart);
router.get('/google/callback',   googleCallback);

module.exports = router;
