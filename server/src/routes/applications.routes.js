// server/src/routes/applications.routes.js

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth.middleware');
const { expensiveLimiter } = require('../middleware/security.middleware');
const {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  getSheetsStatus,
  getSheetsConnectUrl,
  sheetsCallback,
  syncSheets,
} = require('../controllers/applications.controller');

// Google redirects the BROWSER here, so there is no Authorization header.
// The signed, 10-minute `state` in the URL identifies the student instead.
router.get('/sheets/callback', sheetsCallback);

router.use(requireAuth);

router.get('/sheets/status', getSheetsStatus);
router.get('/sheets/connect', getSheetsConnectUrl);
router.post('/sync-sheets', expensiveLimiter, syncSheets);

router.get('/', getApplications);
router.post('/', createApplication);
router.patch('/:id', updateApplication);
router.delete('/:id', deleteApplication);

module.exports = router;
