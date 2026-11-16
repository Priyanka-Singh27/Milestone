// server/src/models/GoogleSheetsAuth.model.js
//
// A student's Google refresh token for the Sheets sync, stored ENCRYPTED
// (AES-256-GCM, see utils/crypto.js). Never returned by any endpoint.

const mongoose = require('mongoose');

const googleSheetsAuthSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    refreshTokenEnc: { type: String, required: true },
    scope: { type: String, default: '' },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GoogleSheetsAuth', googleSheetsAuthSchema);
