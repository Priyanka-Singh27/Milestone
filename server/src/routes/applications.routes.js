const express = require('express');
const router = express.Router();
const {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  sheetsStatus,
  sheetsConnect,
  sheetsCallback,
  syncSheets,
} = require('../controllers/applications.controller');

router.get('/', getApplications);
router.post('/', createApplication);

// Google Sheets: connect once, then sync. The callback is opened by the
// browser after Google's consent screen, so it must stay reachable without
// an Authorization header when real auth is added to this router.
router.get('/sheets/status', sheetsStatus);
router.get('/sheets/connect', sheetsConnect);
router.get('/sheets/callback', sheetsCallback);
router.post('/sync-sheets', syncSheets);

router.patch('/:id', updateApplication);
router.delete('/:id', deleteApplication);

module.exports = router;
