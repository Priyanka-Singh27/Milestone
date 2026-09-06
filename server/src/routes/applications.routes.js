const express = require('express');
const router = express.Router();
const {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  syncSheets,
} = require('../controllers/applications.controller');

router.get('/', getApplications);
router.post('/', createApplication);
router.patch('/:id', updateApplication);
router.delete('/:id', deleteApplication);
router.post('/sync-sheets', syncSheets);

module.exports = router;
