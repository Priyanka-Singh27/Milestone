// Google Sheets sync using per-user OAuth credentials. Refresh tokens are
// encrypted at rest; OAuth state is signed and expires after ten minutes.
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const SheetMapping = require('../models/SheetMapping.model');
const GoogleSheetsAuth = require('../models/GoogleSheetsAuth.model');
const { encrypt, decrypt } = require('../utils/crypto');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const HEADERS = ['Company', 'Role', 'Status', 'Applied Date', 'Last Updated', 'Notes'];
const TAB = 'Applications';

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
  const redirectUri = process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    (process.env.GOOGLE_REDIRECT_URI || '').replace(/\/auth\/google\/callback\/?$/, '/applications/sheets/callback');
  return { clientId, clientSecret, redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri.includes('/sheets/callback')) };
}

function isConfigured() { return sheetsConfig().configured; }

function oauthClient() {
  const { clientId, clientSecret, redirectUri, configured } = sheetsConfig();
  if (!configured) throw new SheetsError('SHEETS_NOT_CONFIGURED', 'Google Sheets sync is not set up on this server.', 503);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function buildAuthUrl(userId) {
  if (!process.env.JWT_SECRET) throw new SheetsError('SHEETS_NOT_CONFIGURED', 'Google Sheets sync is not set up on this server.', 503);
  const state = jwt.sign({ userId, purpose: 'sheets' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return oauthClient().generateAuthUrl({
    access_type: 'offline', prompt: 'consent', scope: [SHEETS_SCOPE],
    include_granted_scopes: true, state,
  });
}

async function handleCallback(code, state) {
  let payload;
  try { payload = jwt.verify(String(state), process.env.JWT_SECRET); }
  catch { throw new SheetsError('SHEETS_STATE_INVALID', 'This connection link expired. Please try again.'); }
  if (!payload || payload.purpose !== 'sheets' || !payload.userId) {
    throw new SheetsError('SHEETS_STATE_INVALID', 'This connection link is not valid.');
  }

  let tokens;
  try { ({ tokens } = await oauthClient().getToken(String(code))); }
  catch { throw new SheetsError('SHEETS_TOKEN_FAILED', 'Google did not accept the sign-in. Please try again.'); }
  const existing = await GoogleSheetsAuth.findOne({ userId: payload.userId });
  if (!tokens.refresh_token && !existing) {
    throw new SheetsError('SHEETS_TOKEN_FAILED', 'Google did not grant offline access. Remove Milestone from your Google account permissions and try again.');
  }
  if (tokens.refresh_token) {
    await GoogleSheetsAuth.findOneAndUpdate({ userId: payload.userId }, { $set: {
      refreshTokenEnc: encrypt(tokens.refresh_token), scope: tokens.scope || SHEETS_SCOPE, connectedAt: new Date(),
    } }, { upsert: true });
  }
  return payload.userId;
}

async function isConnected(userId) { return Boolean(await GoogleSheetsAuth.exists({ userId })); }

async function authorizedClient(userId) {
  const record = await GoogleSheetsAuth.findOne({ userId });
  if (!record) throw new SheetsError('SHEETS_NOT_CONNECTED', 'Connect Google Sheets first.');
  let refreshToken;
  try { refreshToken = decrypt(record.refreshTokenEnc); }
  catch {
    await GoogleSheetsAuth.deleteOne({ userId });
    throw new SheetsError('SHEETS_NOT_CONNECTED', 'Connect Google Sheets first.');
  }
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function createSheet(api, userId) {
  const result = await api.spreadsheets.create({ requestBody: {
    properties: { title: 'Milestone — Internship Applications' },
    sheets: [{ properties: { title: TAB } }],
  } });
  return SheetMapping.create({ userId, sheetId: result.data.spreadsheetId, sheetUrl: result.data.spreadsheetUrl });
}

function rowsFor(applications) {
  return applications.map((app) => [
    app.company, app.role, app.status,
    app.appliedDate ? new Date(app.appliedDate).toISOString().split('T')[0] : '',
    app.lastUpdated ? new Date(app.lastUpdated).toISOString().split('T')[0] : '', app.notes || '',
  ]);
}

async function writeRows(api, sheetId, applications) {
  await api.spreadsheets.values.clear({ spreadsheetId: sheetId, range: TAB });
  await api.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${TAB}!A1`,
    valueInputOption: 'RAW', requestBody: { values: [HEADERS, ...rowsFor(applications)] } });
}

async function writeApplicationsToSheet(userId, applications) {
  try {
    const auth = await authorizedClient(userId);
    const api = google.sheets({ version: 'v4', auth });
    let mapping = await SheetMapping.findOne({ userId });
    if (!mapping) mapping = await createSheet(api, userId);
    try { await writeRows(api, mapping.sheetId, applications); }
    catch (err) {
      if (Number(err?.code || err?.response?.status) !== 404) throw err;
      await SheetMapping.deleteOne({ userId });
      mapping = await createSheet(api, userId);
      await writeRows(api, mapping.sheetId, applications);
    }
    return mapping.sheetUrl;
  } catch (err) {
    const message = String(err?.response?.data?.error || err?.message || '');
    if (/invalid_grant|invalid_token|unauthorized_client/i.test(message) || Number(err?.code) === 401) {
      await GoogleSheetsAuth.deleteOne({ userId });
      throw new SheetsError('SHEETS_AUTH_EXPIRED', 'Google access ended. Please connect again.', 401);
    }
    if (Number(err?.code) === 403 && /disabled|accessNotConfigured|has not been used/i.test(message)) {
      throw new SheetsError('SHEETS_NOT_CONFIGURED', 'Google Sheets sync is not available right now.', 503);
    }
    if (err instanceof SheetsError) throw err;
    throw err;
  }
}

module.exports = { SHEETS_SCOPE, SheetsError, isConfigured, buildAuthUrl, handleCallback,
  isConnected, writeApplicationsToSheet };
