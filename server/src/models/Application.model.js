const mongoose = require('mongoose');

// status is intentionally a free string, not an enum — CONTRACTS.md 4.2:
// users can add their own custom pipeline stages beyond the 5 defaults.
const applicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, required: true, default: 'Applied', trim: true, maxlength: 40 },
    appliedDate: { type: Date, required: true },
    lastUpdated: { type: Date, default: Date.now },
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);
