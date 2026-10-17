// server/src/controllers/profile.controller.js
//
// GET  /api/v1/profile        — return current user's public profile
// PATCH /api/v1/profile       — update name and/or targetRoleId
//
// Rules (per PROJECT_TASKS.md §4.3):
//   - targetRoleId: must be a real Role _id (string) OR null (clears it).
//     Unknown role -> 400 UNKNOWN_ROLE (read-only existence check on Role
//     collection — we do NOT write to it).
//   - Empty name string -> 400 INVALID_NAME.
//   - Empty request body (no name, no targetRoleId key) -> 400 NOTHING_TO_UPDATE.

const mongoose = require('mongoose');
const User = require('../models/User.model');
const Role = require('../models/Role.model');
const { ok, fail } = require('../utils/respond');

// ── GET /api/v1/profile ───────────────────────────────────────────────────────

async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'User not found.');

    return ok(res, { user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
}

// ── PATCH /api/v1/profile ─────────────────────────────────────────────────────

async function updateProfile(req, res, next) {
  try {
    const { name, targetRoleId } = req.body;

    // Must have at least one field to update
    if (name === undefined && targetRoleId === undefined) {
      return fail(res, 400, 'NOTHING_TO_UPDATE', 'Provide at least one field to update: name or targetRoleId.');
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return fail(res, 400, 'INVALID_NAME', 'name must be a non-empty string.');
      }
      updates.name = name.trim();
    }

    if (targetRoleId !== undefined) {
      if (targetRoleId === null) {
        // Explicitly clearing the role — allowed
        updates.targetRoleId = null;
      } else {
        // Read-only existence check (we don't write to roles collection)
        if (!mongoose.Types.ObjectId.isValid(targetRoleId)) {
          return fail(res, 400, 'UNKNOWN_ROLE', `No role found with id "${targetRoleId}".`);
        }
        const roleExists = await Role.exists({ _id: targetRoleId });
        if (!roleExists) {
          return fail(res, 400, 'UNKNOWN_ROLE', `No role found with id "${targetRoleId}".`);
        }
        updates.targetRoleId = targetRoleId;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    );

    if (!user) return fail(res, 404, 'USER_NOT_FOUND', 'User not found.');

    return ok(res, { user: user.toPublic() });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProfile, updateProfile };
