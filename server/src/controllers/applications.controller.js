const Application = require('../models/Application.model');
const { writeApplicationsToSheet } = require('../services/googleSheets.service');

const DEFAULT_USER_ID = 'dev-user-1';

// GET /api/v1/applications?userId=&status=
const getApplications = async (req, res) => {
  try {
    const userId = req.query.userId || DEFAULT_USER_ID;
    const filter = { userId };
    if (req.query.status) filter.status = req.query.status;

    const applications = await Application.find(filter).sort({ appliedDate: -1 });
    res.status(200).json({ success: true, data: { applications } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// POST /api/v1/applications
const createApplication = async (req, res) => {
  try {
    const { userId, company, role, status, appliedDate, notes } = req.body;

    if (!company || !role) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'company and role are required.' },
      });
    }

    const application = await Application.create({
      userId: userId || DEFAULT_USER_ID,
      company,
      role,
      status: status || 'Applied',
      appliedDate: appliedDate ? new Date(appliedDate) : new Date(),
      lastUpdated: new Date(),
      notes: notes || '',
    });

    res.status(201).json({ success: true, data: { application } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// PATCH /api/v1/applications/:id
const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, lastUpdated: new Date() };
    delete updates.userId; // don't allow reassigning ownership via patch

    const application = await Application.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Application not found.' },
      });
    }

    res.status(200).json({ success: true, data: { application } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// DELETE /api/v1/applications/:id
const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Application.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Application not found.' },
      });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } });
  }
};

// POST /api/v1/applications/sync-sheets
const syncSheets = async (req, res) => {
  try {
    const { userId, googleAccessToken } = req.body;
    const resolvedUserId = userId || DEFAULT_USER_ID;

    if (!googleAccessToken) {
      // CROSS-MEMBER DEPENDENCY: once Person D's OAuth token storage is
      // wired up, stop requiring this in the request body and fetch the
      // user's stored Google token server-side instead.
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_GOOGLE_TOKEN',
          message: 'Google Sheets access token is required to sync (temporary until OAuth token storage is wired up).',
        },
      });
    }

    const applications = await Application.find({ userId: resolvedUserId }).sort({ appliedDate: -1 });
    const sheetUrl = await writeApplicationsToSheet(resolvedUserId, applications, googleAccessToken);

    res.status(200).json({ success: true, data: { sheetUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SHEETS_SYNC_ERROR', message: err.message } });
  }
};

module.exports = { getApplications, createApplication, updateApplication, deleteApplication, syncSheets };
