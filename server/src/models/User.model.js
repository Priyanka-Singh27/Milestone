// server/src/models/User.model.js
//
// User document shape — per CONTRACTS.md §1 and PROJECT_TASKS.md §4.2.
//
// Design notes:
//   - _id stored as String (not ObjectId) so the seed dev-user-1 string ID
//     and real users share one consistent shape, and no ObjectId casting is
//     needed when checking userId across modules.
//   - passwordHash is null for Google-authenticated accounts.
//   - email is always stored lowercase (enforced in the setter + on every
//     code path that touches email).
//   - toPublic() strips passwordHash so no controller ever accidentally
//     sends it in a response.

const mongoose = require('mongoose');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    _id:          { type: String, required: true },
    name:         { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,   // mongoose auto-lowercases on set
      trim: true,
      validate: {
        validator: (v) => EMAIL_REGEX.test(v),
        message: 'Invalid email format',
      },
    },
    passwordHash: { type: String, default: null }, // null for Google accounts
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      required: true,
      default: 'local',
    },
    googleId:     { type: String, default: null }, // Google sub claim
    targetRoleId: { type: String, default: null }, // set during onboarding, changeable later
  },
  {
    timestamps: true,       // createdAt, updatedAt (ISO strings in responses)
    _id: false,             // we supply our own string _id
  }
);

/**
 * Returns a plain object safe to send in API responses.
 * passwordHash is always omitted.
 */
userSchema.methods.toPublic = function () {
  return {
    id:           this._id,
    name:         this.name,
    email:        this.email,
    authProvider: this.authProvider,
    targetRoleId: this.targetRoleId,
    createdAt:    this.createdAt,
    updatedAt:    this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
