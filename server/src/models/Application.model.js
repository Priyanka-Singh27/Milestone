const mongoose = require('mongoose');

// status is intentionally a free string, not an enum — CONTRACTS.md 4.2:
// users can add their own custom pipeline stages beyond the 5 defaults.
const applicationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    company: { type: String, required: true },
    role: { type: String, required: true },
    status: { type: String, required: true, default: 'Applied' },
    appliedDate: { type: Date, required: true },
    lastUpdated: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);
