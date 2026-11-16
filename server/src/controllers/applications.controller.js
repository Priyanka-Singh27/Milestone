// server/src/controllers/applications.controller.js
//
// Application tracker + Google Sheets sync. Every query is scoped to the
// logged-in user, so one student can never read, change or delete another's.

const mongoose = require('mongoose');
const Application = require('../models/Application.model');
const sheets = require('../services/googleSheets.service');
const { assertSelf } = require('../middleware/security.middleware');
const { primaryFrontendUrl } = require('../config/env');
const { safeMessage } = require('../utils/safeError');

const MAX_PER_USER = 1000;
const bad = (res, code, message, status = 400) =>
  res.status(status).json({ success: false, error: { code, message } });
const serverError = (res, err) =>
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });

/** Validates the editable fields. Returns { value } or { error }. */
function readFields(body, { requireAll }) {
  const out = {};

  const text = (key, label, max, required) => {
    if (body[key] === undefined) {
      if (requireAll && required) return `${label} is required.`;
      return null;
    }
    if (typeof body[key] !== 'string') return `${label} must be text.`;
    const v = body[key].trim();
    if (required && !v) return `${label} is required.`;
    if (v.length > max) return `${label} must be ${max} characters or fewer.`;
    out[key] = v;
    return null;
  };

  const err =
    text('company', 'company', 120, true) ||
    text('role', 'role', 120, true) ||
    text('status', 'status', 40, false) ||
    text('notes', 'notes', 2000, false);
  if (err) return { error: err };

  if (body.appliedDate !== undefined && body.appliedDate !== null && body.appliedDate !== '') {
    const d = new Date(body.appliedDate);
    if (Number.isNaN(d.getTime())) return { error: 'appliedDate is not a valid date.' };
    out.appliedDate = d;
  }
  if (out.status === '') delete out.status;
  return { value: out };
}

/** GET /applications?status= */
const getApplications = async (req, res) => {
  try {
    if (!assertSelf(req, res, req.query.userId)) return;

    const filter = { userId: req.user.userId };
    if (typeof req.query.status === 'string' && req.query.status) {
      filter.status = req.query.status.slice(0, 40);
    }
    const applications = await Application.find(filter).sort({ appliedDate: -1 }).limit(MAX_PER_USER);
    res.status(200).json({ success: true, data: { applications } });
  } catch (err) {
    serverError(res, err);
  }
};

/** POST /applications */
const createApplication = async (req, res) => {
  try {
    if (!assertSelf(req, res, req.body?.userId)) return;

    const { value, error } = readFields(req.body || {}, { requireAll: true });
    if (error) return bad(res, 'VALIDATION_ERROR', error);

    const count = await Application.countDocuments({ userId: req.user.userId });
    if (count >= MAX_PER_USER) {
      return bad(res, 'LIMIT_REACHED', `You can track up to ${MAX_PER_USER} applications.`, 400);
    }

    const application = await Application.create({
      userId: req.user.userId,
      company: value.company,
      role: value.role,
      status: value.status || 'Applied',
      appliedDate: value.appliedDate || new Date(),
      notes: value.notes || '',
    });
    res.status(201).json({ success: true, data: { application } });
  } catch (err) {
    serverError(res, err);
  }
};

/** PATCH /applications/:id — only the fields sent. */
const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return bad(res, 'INVALID_ID', 'Invalid id format.');
    if (!assertSelf(req, res, req.body?.userId)) return;

    const { value, error } = readFields(req.body || {}, { requireAll: false });
    if (error) return bad(res, 'VALIDATION_ERROR', error);
    if (Object.keys(value).length === 0) return bad(res, 'VALIDATION_ERROR', 'No fields to update.');

    const application = await Application.findOneAndUpdate(
      { _id: id, userId: req.user.userId }, // someone else's id looks exactly like a missing one
      { $set: { ...value, lastUpdated: new Date() } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!application) return bad(res, 'NOT_FOUND', 'Application not found.', 404);

    res.status(200).json({ success: true, data: { application } });
  } catch (err) {
    serverError(res, err);
  }
};

/** DELETE /applications/:id */
const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return bad(res, 'INVALID_ID', 'Invalid id format.');

    const deleted = await Application.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!deleted) return bad(res, 'NOT_FOUND', 'Application not found.', 404);

    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    serverError(res, err);
  }
};

/* ============================ Google Sheets ============================ */

const sheetsError = (res, err) => {
  if (err instanceof sheets.SheetsError) return bad(res, err.code, err.message, err.statusCode);
  return bad(res, 'SHEETS_SYNC_ERROR', 'Could not sync with Google Sheets. Please try again.', 500);
};

/** GET /applications/sheets/status -> { connected, configured } */
const getSheetsStatus = async (req, res) => {
  try {
    const connected = await sheets.isConnected(req.user.userId);
    res.status(200).json({ success: true, data: { connected, configured: sheets.isConfigured() } });
  } catch (err) {
    serverError(res, err);
  }
};

/** GET /applications/sheets/connect -> { authUrl }. The browser then goes to Google. */
const getSheetsConnectUrl = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: { authUrl: sheets.buildAuthUrl(req.user.userId) } });
  } catch (err) {
    sheetsError(res, err);
  }
};

const escapeHtml = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function resultPage(title, message, ok) {
  const back = `${primaryFrontendUrl()}/applications`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#e6f4f7;color:#173f46}
 main{max-width:420px;margin:24px;padding:32px;background:#fffaf0;border:2px solid #e3d8b8;border-radius:20px;text-align:center}
 h1{margin:0 0 10px;font-size:24px} p{line-height:1.5;color:#46606a}
 a{display:inline-block;margin-top:14px;padding:11px 22px;border-radius:999px;background:${ok ? '#e8b84b' : '#d9e6e8'};color:#4a3510;font-weight:700;text-decoration:none}
</style></head><body><main>
<h1>${ok ? '✅' : '⚠️'} ${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
<a href="${escapeHtml(back)}">Back to Milestone</a></main></body></html>`;
}

/** GET /applications/sheets/callback — Google redirects here (no login header: the signed state identifies the student). */
const sheetsCallback = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (req.query.error) {
      return res.status(200).send(resultPage('Not connected', 'Google access was not granted, so nothing was connected.', false));
    }
    if (typeof req.query.code !== 'string' || typeof req.query.state !== 'string') {
      return res.status(400).send(resultPage('Something went wrong', 'The Google response was incomplete. Please try again.', false));
    }
    await sheets.handleCallback(req.query.code, req.query.state);
    return res.status(200).send(resultPage('Google Sheets connected', 'You can now sync your applications to Google Sheets.', true));
  } catch (err) {
    const message = err instanceof sheets.SheetsError ? err.message : 'We could not connect Google Sheets. Please try again.';
    return res.status(400).send(resultPage('Not connected', message, false));
  }
};

/** POST /applications/sync-sheets -> { sheetUrl } */
const syncSheets = async (req, res) => {
  try {
    const applications = await Application.find({ userId: req.user.userId })
      .sort({ appliedDate: -1 })
      .limit(MAX_PER_USER);
    const sheetUrl = await sheets.writeApplicationsToSheet(req.user.userId, applications);
    res.status(200).json({ success: true, data: { sheetUrl } });
  } catch (err) {
    sheetsError(res, err);
  }
};

module.exports = {
  getApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  getSheetsStatus,
  getSheetsConnectUrl,
  sheetsCallback,
  syncSheets,
};
