const crypto = require('crypto');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const SheetMapping = require('../models/SheetMapping.model');
const GoogleSheetsAuth = require('../models/GoogleSheetsAuth.model');

// Incremental consent (CONTRACTS.md 7.1): users sign in with basic scopes;
// the Sheets scope is only requested when they choose to connect Sheets.
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const HEADERS = ['Company', 'Role', 'Status', 'Applied Date', 'Last Updated', 'Notes'];
const TAB = 'Applications';

// Errors carry an HTTP status and a code so the controller can answer with
// the standard { success: false, error: { code, message } } shape.
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

const requireSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw fail(500, 'SHEETS_NOT_CONFIGURED', 'JWT_SECRET is not set on the server.');
  }
  return process.env.JWT_SECRET;
};

// Separate keys derived from JWT_SECRET so a login token can never be used
// as a Sheets "state" token, and the stored refresh token is encrypted with
// its own key.
const derive = (label) =>
  crypto.createHash('sha256').update(`${label}:${requireSecret()}`).digest();

const encryptToken = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive('sheets-token'), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
};

const decryptToken = (packed) => {
  const [iv, tag, enc] = packed.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', derive('sheets-token'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

const getOAuthClient = () => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_SHEETS_REDIRECT_URI) {
    throw fail(
      500,
      'SHEETS_NOT_CONFIGURED',
      'Google Sheets sync is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI).'
    );
  }
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI);
};

// Step 1 of connecting: the URL the user must visit to grant Sheets access.
const getAuthUrl = (userId) => {
  const client = getOAuthClient();
  const state = jwt.sign(
    { userId, purpose: 'sheets-connect' },
    derive('sheets-state').toString('hex'),
    { expiresIn: '10m' }
  );
  return client.generateAuthUrl({
    access_type: 'offline', // we need a refresh token for later syncs
    prompt: 'consent', // forces Google to return that refresh token
    scope: [SHEETS_SCOPE],
    include_granted_scopes: true,
    state,
  });
};

// Step 2: Google redirects back with ?code=&state=. The signed state tells
// us which user this is, since the browser redirect carries no login token.
const handleCallback = async (code, state) => {
  const invalidState = () =>
    fail(400, 'INVALID_STATE', 'The Google sign-in session is invalid or expired. Start the connection again.');

  let payload;
  try {
    payload = jwt.verify(state, derive('sheets-state').toString('hex'));
  } catch (err) {
    throw invalidState();
  }
  if (!payload || payload.purpose !== 'sheets-connect' || !payload.userId) throw invalidState();

  const client = getOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (err) {
    throw fail(400, 'GOOGLE_EXCHANGE_FAILED', 'Google rejected the authorization code.');
  }
  if (!tokens || !tokens.refresh_token) {
    throw fail(
      400,
      'NO_REFRESH_TOKEN',
      'Google did not return a refresh token. Remove this app from your Google account permissions and connect again.'
    );
  }

  await GoogleSheetsAuth.updateOne(
    { userId: payload.userId },
    { $set: { refreshTokenEnc: encryptToken(tokens.refresh_token), scope: tokens.scope || SHEETS_SCOPE } },
    { upsert: true }
  );
  return payload.userId;
};

const isConnected = async (userId) => !!(await GoogleSheetsAuth.exists({ userId }));

const getAuthorizedClient = async (userId) => {
  const notConnected = () =>
    fail(400, 'SHEETS_NOT_CONNECTED', 'Google Sheets is not connected yet. Connect it first, then sync.');

  const record = await GoogleSheetsAuth.findOne({ userId });
  if (!record) throw notConnected();

  let refreshToken;
  try {
    refreshToken = decryptToken(record.refreshTokenEnc);
  } catch (err) {
    // Unreadable token (for example JWT_SECRET changed): ask the user to reconnect.
    await GoogleSheetsAuth.deleteOne({ userId });
    throw notConnected();
  }

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
};

const httpStatus = (err) => err.code || err.status || (err.response && err.response.status);
const isNotFound = (err) => httpStatus(err) === 404;
const isAuthError = (err) =>
  httpStatus(err) === 401 ||
  /invalid_grant/.test(String(err.message)) ||
  (err.response && err.response.data && err.response.data.error === 'invalid_grant');

const getOrCreateSheet = async (userId, api) => {
  const existing = await SheetMapping.findOne({ userId });
  if (existing) return existing;

  const created = await api.spreadsheets.create({
    requestBody: {
      properties: { title: 'Internship Applications' },
      sheets: [{ properties: { title: TAB } }],
    },
  });
  return SheetMapping.create({
    userId,
    sheetId: created.data.spreadsheetId,
    sheetUrl: created.data.spreadsheetUrl,
  });
};

const toRows = (applications) =>
  applications.map((app) => [
    app.company,
    app.role,
    app.status,
    app.appliedDate ? new Date(app.appliedDate).toISOString().split('T')[0] : '',
    app.lastUpdated ? new Date(app.lastUpdated).toISOString().split('T')[0] : '',
    app.notes || '',
  ]);

// Clear first so applications deleted in the tracker disappear from the
// sheet. valueInputOption RAW stores text as-is, so a note starting with "="
// is never run as a formula.
const writeRows = async (api, spreadsheetId, applications) => {
  await api.spreadsheets.values.clear({ spreadsheetId, range: TAB });
  await api.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS, ...toRows(applications)] },
  });
};

const syncApplications = async (userId, applications) => {
  const auth = await getAuthorizedClient(userId);
  const api = google.sheets({ version: 'v4', auth });

  try {
    let mapping = await getOrCreateSheet(userId, api);
    try {
      await writeRows(api, mapping.sheetId, applications);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // The user deleted the sheet in Google Drive: start a fresh one.
      await SheetMapping.deleteOne({ userId });
      mapping = await getOrCreateSheet(userId, api);
      await writeRows(api, mapping.sheetId, applications);
    }
    return mapping.sheetUrl;
  } catch (err) {
    if (isAuthError(err)) {
      await GoogleSheetsAuth.deleteOne({ userId });
      throw fail(401, 'SHEETS_AUTH_EXPIRED', 'Google access expired or was revoked. Connect Google Sheets again.');
    }
    throw err;
  }
};

module.exports = {
  SHEETS_SCOPE,
  getAuthUrl,
  handleCallback,
  isConnected,
  syncApplications,
  encryptToken,
  decryptToken,
};
