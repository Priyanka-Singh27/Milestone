// server/src/controllers/certificates.controller.js

const mongoose = require('mongoose');
const Certificate = require('../models/Certificate.model');
const { uploadBuffer, tryDeleteFromUrl } = require('../services/cloudinary.service');
const { assertSelf } = require('../middleware/security.middleware');
const { matchesSignature } = require('../utils/fileSignature');
const { safeMessage } = require('../utils/safeError');

const TYPES = ['badge', 'uploaded'];

const bad = (res, code, message, status = 400) =>
  res.status(status).json({ success: false, error: { code, message } });

/** POST /certificates/upload  (multipart: file, title, issuer, dateIssued?, tags?) */
const uploadCertificate = async (req, res) => {
  try {
    const userId = req.user.userId; // always the logged-in user
    if (!assertSelf(req, res, req.body.userId)) return;

    const { title, issuer, dateIssued, tags } = req.body;

    if (!req.file) return bad(res, 'VALIDATION_ERROR', 'A certificate file is required.');
    if (!matchesSignature(req.file.buffer, req.file.mimetype)) {
      return bad(res, 'INVALID_FILE_TYPE', 'That file does not look like a real PDF, JPG or PNG.');
    }
    if (typeof title !== 'string' || typeof issuer !== 'string' || !title.trim() || !issuer.trim()) {
      return bad(res, 'VALIDATION_ERROR', 'title and issuer are required.');
    }
    if (title.trim().length > 120 || issuer.trim().length > 120) {
      return bad(res, 'VALIDATION_ERROR', 'title and issuer must be 120 characters or fewer.');
    }

    let issued = new Date();
    if (dateIssued) {
      issued = new Date(dateIssued);
      if (Number.isNaN(issued.getTime())) return bad(res, 'VALIDATION_ERROR', 'dateIssued is not a valid date.');
    }

    const rawTags = Array.isArray(tags) ? tags : String(tags || '').split(',');
    const parsedTags = [...new Set(rawTags.map((t) => String(t).trim()).filter(Boolean))];
    if (parsedTags.length > 10 || parsedTags.some((t) => t.length > 30)) {
      return bad(res, 'VALIDATION_ERROR', 'Use at most 10 tags of 30 characters each.');
    }

    const { url } = await uploadBuffer(req.file.buffer, `certificates/${userId}`);

    const certificate = await Certificate.create({
      userId,
      type: 'uploaded',
      title: title.trim(),
      issuer: issuer.trim(),
      dateIssued: issued,
      tags: parsedTags,
      fileUrl: url,
      quizScore: null,
    });

    res.status(201).json({ success: true, data: { certificate } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

/** POST /certificates/badge — internal only. Idempotent: one badge per user per topic. */
const createBadge = async (req, res) => {
  try {
    const { userId, topicId, title, quizScore } = req.body;

    if (typeof userId !== 'string' || !userId || typeof title !== 'string' || !title) {
      return bad(res, 'VALIDATION_ERROR', 'userId and title are required.');
    }

    if (typeof topicId === 'string' && topicId) {
      const existing = await Certificate.findOne({ userId, type: 'badge', tags: topicId });
      if (existing) return res.status(200).json({ success: true, data: { certificate: existing } });
    }

    const certificate = await Certificate.create({
      userId,
      type: 'badge',
      title: title.slice(0, 120),
      issuer: 'Platform-verified',
      dateIssued: new Date(),
      tags: typeof topicId === 'string' && topicId ? [topicId] : [],
      fileUrl: null,
      quizScore: typeof quizScore === 'number' ? quizScore : null,
    });

    res.status(201).json({ success: true, data: { certificate } });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Certificate.findOne({
        userId: req.body.userId, type: 'badge', tags: req.body.topicId,
      });
      if (existing) return res.status(200).json({ success: true, data: { certificate: existing } });
    }
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

/** GET /certificates?type=&tag= — the logged-in user's own list. */
const getCertificates = async (req, res) => {
  try {
    if (!assertSelf(req, res, req.query.userId)) return;

    const filter = { userId: req.user.userId };
    if (typeof req.query.type === 'string' && req.query.type) {
      if (!TYPES.includes(req.query.type)) return bad(res, 'VALIDATION_ERROR', 'type must be "badge" or "uploaded".');
      filter.type = req.query.type;
    }
    if (typeof req.query.tag === 'string' && req.query.tag) filter.tags = req.query.tag.slice(0, 60);

    const certificates = await Certificate.find(filter).sort({ dateIssued: -1 });
    res.status(200).json({ success: true, data: { certificates } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

/** DELETE /certificates/:id — only your own, and never a badge. */
const deleteCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return bad(res, 'INVALID_ID', 'Invalid id format.');

    // Scoped to the caller: someone else's id looks exactly like a missing one.
    const certificate = await Certificate.findOne({ _id: id, userId: req.user.userId });
    if (!certificate) return bad(res, 'NOT_FOUND', 'Certificate not found.', 404);

    if (certificate.type === 'badge') return bad(res, 'FORBIDDEN', 'Badges cannot be deleted.', 403);

    await tryDeleteFromUrl(certificate.fileUrl);
    await Certificate.deleteOne({ _id: id, userId: req.user.userId });
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: safeMessage(err) } });
  }
};

module.exports = { uploadCertificate, createBadge, getCertificates, deleteCertificate };
