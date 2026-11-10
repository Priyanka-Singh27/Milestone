const mongoose = require('mongoose');

// Stores the Google refresh token a user granted for Sheets access, so a
// sync can run later without asking them to sign in again. The token is
// stored encrypted (see googleSheets.service.js), never in plain text.
const googleSheetsAuthSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    refreshTokenEnc: { type: String, required: true },
    scope: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GoogleSheetsAuth', googleSheetsAuthSchema);
