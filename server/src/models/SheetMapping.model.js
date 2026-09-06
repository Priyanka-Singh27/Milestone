const mongoose = require('mongoose');

// Maps a user to their synced Google Sheet so repeat syncs update the
// same sheet instead of duplicating (CONTRACTS.md 3.4, point 2).
const sheetMappingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    sheetId: { type: String, required: true },
    sheetUrl: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SheetMapping', sheetMappingSchema);
