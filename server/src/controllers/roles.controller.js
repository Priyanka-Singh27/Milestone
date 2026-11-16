// server/src/controllers/roles.controller.js

const Role = require('../models/Role.model');
const { safeMessage } = require('../utils/safeError');

/**
 * GET /api/v1/roles
 * Public list of roles with their topics and lesson outlines. Each role carries
 * BOTH `_id` and `id` (same value) so clients can use either.
 */
const getRoles = async (req, res) => {
  try {
    const roles = (await Role.find().lean()).map((r) => ({ ...r, id: String(r._id) }));
    // Roles are seed data that changes rarely: let browsers/CDNs reuse it briefly.
    res.set('Cache-Control', 'public, max-age=300');
    res.status(200).json({ success: true, data: { roles } });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: safeMessage(err) },
    });
  }
};

module.exports = { getRoles };
