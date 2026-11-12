const mongoose = require('mongoose');
const Application = require('../models/Application.model');
const sheets = require('../services/googleSheets.service');

// Placeholder until the lead switches every module to real auth together.
const DEFAULT_USER_ID = 'dev-user-1';

const sendError = (res, status, code, message) =>
  res.status(status).json({ success: false, error: { code, message } });

const invalidId = (res) => sendError(res, 400, 'INVALID_ID', 'Invalid id format.');

// Errors thrown by googleSheets.service carry { status, code }.
const sendSheetsError = (res, err, fallbackCode) =>
  err.status
    ? sendError(res, err.status, err.code, err.message)
    : sendError(res, 500, fallbackCode, err.message);

// GET /api/v1/applications?userId=&status=
const getApplications = async (req, res) => {
  try {
    const userId = req.query.userId || DEFAULT_USER_ID;
    const filter = { userId };
    if (req.query.status) filter.status = req.query.status;

    const applications = await Application.find(filter).sort({ appliedDate: -1 });
    res.status(200).json({ success: true, data: { applications } });
  } catch (err) {
    sendError(res, 500, 'SERVER_ERROR', err.message);
  }
};

// POST /api/v1/applications
const createApplication = async (req, res) => {
  try {
    const { userId, company, role, status, appliedDate, notes } = req.body || {};

    if (!company || !role) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'company and role are required.');
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
    sendError(res, 500, 'SERVER_ERROR', err.message);
  }
};

// PATCH /api/v1/applications/:id
const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(res);

    const updates = { ...(req.body || {}), lastUpdated: new Date() };
    delete updates.userId; // ownership can't be reassigned through PATCH

    const application = await Application.findByIdAndUpdate(id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!application) return sendError(res, 404, 'NOT_FOUND', 'Application not found.');
    res.status(200).json({ success: true, data: { application } });
  } catch (err) {
    sendError(res, 500, 'SERVER_ERROR', err.message);
  }
};

// DELETE /api/v1/applications/:id
const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return invalidId(res);

    const deleted = await Application.findByIdAndDelete(id);
    if (!deleted) return sendError(res, 404, 'NOT_FOUND', 'Application not found.');
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    sendError(res, 500, 'SERVER_ERROR', err.message);
  }
};

// GET /api/v1/applications/sheets/status?userId=
const sheetsStatus = async (req, res) => {
  try {
    const userId = req.query.userId || DEFAULT_USER_ID;
    const connected = await sheets.isConnected(userId);
    res.status(200).json({ success: true, data: { connected } });
  } catch (err) {
    sendSheetsError(res, err, 'SERVER_ERROR');
  }
};

// GET /api/v1/applications/sheets/connect?userId=
// Returns the Google consent URL; the frontend sends the user there.
const sheetsConnect = async (req, res) => {
  try {
    const userId = req.query.userId || DEFAULT_USER_ID;
    const authUrl = sheets.getAuthUrl(userId);
    res.status(200).json({ success: true, data: { authUrl } });
  } catch (err) {
    sendSheetsError(res, err, 'SERVER_ERROR');
  }
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GET /api/v1/applications/sheets/callback?code=&state=
// Google sends the browser here after consent. It carries no login token;
// the signed `state` identifies the user instead.
const sheetsCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      return sendError(res, 400, 'SHEETS_ACCESS_DENIED', 'Google Sheets access was not granted.');
    }
    if (!code || !state) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'code and state are required.');
    }

    await sheets.handleCallback(code, state);

    const frontend = String(process.env.FRONTEND_URL || '').split(',')[0].trim();
    const backLink = frontend
      ? `<p><a href="${escapeHtml(frontend)}/applications">Back to the app</a></p>`
      : '';
    res
      .status(200)
      .type('html')
      .send(`<!doctype html><html><body><h2>Google Sheets connected</h2><p>You can close this tab and sync your applications.</p>${backLink}</body></html>`);
  } catch (err) {
    sendSheetsError(res, err, 'SHEETS_CONNECT_ERROR');
  }
};

// POST /api/v1/applications/sync-sheets
const syncSheets = async (req, res) => {
  try {
    const userId = (req.body && req.body.userId) || DEFAULT_USER_ID;
    const applications = await Application.find({ userId }).sort({ appliedDate: -1 });
    const sheetUrl = await sheets.syncApplications(userId, applications);
    res.status(200).json({ success: true, data: { sheetUrl } });
  } catch (err) {
    sendSheetsError(res, err, 'SHEETS_SYNC_ERROR');
  }
};

module.exports = {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  sheetsStatus,
  sheetsConnect,
  sheetsCallback,
  syncSheets,
};
