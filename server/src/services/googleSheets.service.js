// server/src/services/googleSheets.service.js
//
// Google Sheets sync using a per-student OAuth connection:
//   1. GET  /applications/sheets/connect  -> consent URL (state = signed, 10 min)
//   2. Google redirects to /applications/sheets/callback -> we store the
//      refresh token, encrypted
//   3. POST /applications/sync-sheets     -> writes the sheet using that token
//
// Needs in Google Cloud: the Sheets API enabled, and the redirect URI below
// added to the OAuth client's "Authorized redirect URIs".

const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const SheetMapping = require('../models/SheetMapping.model');
const GoogleSheetsAuth = require('../models/GoogleSheetsAuth.model');
const { encrypt, decrypt } = require('../utils/crypto');

const HEADERS = ['Company', 'Role', 'Status', 'Applied Date', 'Last Updated', 'Notes'];
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

class SheetsError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sheetsConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    (process.env.GOOGLE_REDIRECT_URI || '').replace(
      /\/auth\/google\/callback\/?$/,
      '/applications/sheets/callback'
    );
  const configured = Boolean(clientId && clientSecret && redirectUri.includes('/sheets/callback'));
  return { clientId, clientSecret, redirectUri, configured };
}

function isConfigured() {
  return sheetsConfig().configured;
}

function oauthClient() {
  const { clientId, clientSecret, redirectUri, configured } = sheetsConfig();
  if (!configured) {
    throw new SheetsError('SHEETS_NOT_CONFIGURED', 'Google Sheets sync is not set up on this server.', 503);
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Consent URL. `state` proves later who started the flow and expires in 10 minutes. */
function buildAuthUrl(userId) {
  const state = jwt.sign({ userId, purpose: 'sheets' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh token even on re-connect
    scope: SCOPES,
    state,
  });
}

/** Called by the OAuth redirect. Returns the userId that was connected. */
async function handleCallback(code, state) {
  let payload;
  try {
    payload = jwt.verify(String(state), process.env.JWT_SECRET);
  } catch {
    throw new SheetsError('SHEETS_STATE_INVALID', 'This connection link expired. Please try again.');
  }
  if (!payload || payload.purpose !== 'sheets' || !payload.userId) {
    throw new SheetsError('SHEETS_STATE_INVALID', 'This connection link is not valid.');
  }

  const client = oauthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(String(code)));
  } catch {
    throw new SheetsError('SHEETS_TOKEN_FAILED', 'Google did not accept the sign-in. Please try again.');
  }

  const existing = await GoogleSheetsAuth.findOne({ userId: payload.userId });
  if (!tokens.refresh_token && !existing) {
    throw new SheetsError(
      'SHEETS_TOKEN_FAILED',
      'Google did not grant offline access. Remove Milestone from your Google account permissions and try again.'
    );
  }

  if (tokens.refresh_token) {
    await GoogleSheetsAuth.findOneAndUpdate(
      { userId: payload.userId },
      {
        $set: {
          refreshTokenEnc: encrypt(tokens.refresh_token),
          scope: tokens.scope || SCOPES.join(' '),
          connectedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
  return payload.userId;
}

async function isConnected(userId) {
  return Boolean(await GoogleSheetsAuth.exists({ userId }));
}

async function authorizedClient(userId) {
  const record = await GoogleSheetsAuth.findOne({ userId });
  if (!record) throw new SheetsError('SHEETS_NOT_CONNECTED', 'Connect Google Sheets first.');
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(record.refreshTokenEnc) });
  return client;
}

/** Translate Google API failures into the error codes the frontend understands. */
async function translateGoogleError(err, userId) {
  if (err instanceof SheetsError) return err;
  const msg = String(err?.response?.data?.error || err?.message || '');
  if (/invalid_grant|invalid_token|unauthorized_client/i.test(msg) || err?.code === 401) {
    await GoogleSheetsAuth.deleteOne({ userId }); // revoked or expired: force a clean reconnect
    return new SheetsError('SHEETS_AUTH_EXPIRED', 'Google access ended. Please connect again.', 401);
  }
  if (err?.code === 403 && /has not been used|disabled|accessNotConfigured/i.test(msg + JSON.stringify(err?.errors || ''))) {
    return new SheetsError('SHEETS_NOT_CONFIGURED', 'Google Sheets sync is not available right now.', 503);
  }
  return err;
}

async function createSheet(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Milestone — Internship Applications' },
      sheets: [{ properties: { title: 'Applications' } }],
    },
  });
  return { sheetId: res.data.spreadsheetId, sheetUrl: res.data.spreadsheetUrl };
}

/** Writes every application to the student's sheet (creating it the first time). */
async function writeApplicationsToSheet(userId, applications) {
  try {
    const auth = await authorizedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    let mapping = await SheetMapping.findOne({ userId });
    if (!mapping) {
      const created = await createSheet(auth);
      mapping = await SheetMapping.create({ userId, ...created });
    }

    const rows = applications.map((app) => [
      app.company,
      app.role,
      app.status,
      app.appliedDate ? new Date(app.appliedDate).toISOString().split('T')[0] : '',
      app.lastUpdated ? new Date(app.lastUpdated).toISOString().split('T')[0] : '',
      app.notes || '',
    ]);

    const write = () =>
      sheets.spreadsheets.values.update({
        spreadsheetId: mapping.sheetId,
        range: 'Applications!A1',
        // RAW: cell text is stored as typed, so "=HYPERLINK(...)" in a note can
        // never run as a formula.
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS, ...rows] },
      });

    try {
      await write();
    } catch (err) {
      if (err?.code === 404) {
        // The student deleted the sheet in Drive: make a new one and retry once.
        await SheetMapping.deleteOne({ userId });
        const created = await createSheet(auth);
        mapping = await SheetMapping.create({ userId, ...created });
        await write();
      } else {
        throw err;
      }
    }
    return mapping.sheetUrl;
  } catch (err) {
    throw await translateGoogleError(err, userId);
  }
}

module.exports = {
  SheetsError,
  isConfigured,
  buildAuthUrl,
  handleCallback,
  isConnected,
  writeApplicationsToSheet,
};
