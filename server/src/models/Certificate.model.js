const mongoose = require('mongoose');

// Shape locked to CONTRACTS.md 4.3 — do not add fields (e.g. a stored
// cloudinary publicId) without flagging it to the team first.
const certificateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: ['badge', 'uploaded'], required: true },
    title: { type: String, required: true },
    issuer: { type: String, required: true },
    dateIssued: { type: Date, required: true },
    tags: [{ type: String }],
    fileUrl: { type: String, default: null },
    quizScore: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Certificate', certificateSchema);
