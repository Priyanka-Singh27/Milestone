const { google } = require('googleapis');
const SheetMapping = require('../models/SheetMapping.model');

const HEADERS = ['Company', 'Role', 'Status', 'Applied Date', 'Last Updated', 'Notes'];

// CROSS-MEMBER DEPENDENCY: this currently expects a valid Google OAuth
// access token to be passed straight in (see applications.controller.js
// -> syncSheets). Once Person D's auth system stores per-user Google
// tokens after the incremental-consent flow (CONTRACTS.md 7.1), replace
// getSheetsClient's token source with a server-side lookup instead of
// requiring the frontend to pass it on every request.

const getSheetsClient = (accessToken) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: 'v4', auth });
};

const getOrCreateSheet = async (userId, accessToken) => {
  let mapping = await SheetMapping.findOne({ userId });
  if (mapping) return mapping;

  const sheets = getSheetsClient(accessToken);
  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Internship Applications — ${userId}` },
      sheets: [{ properties: { title: 'Applications' } }],
    },
  });

  mapping = await SheetMapping.create({
    userId,
    sheetId: createRes.data.spreadsheetId,
    sheetUrl: createRes.data.spreadsheetUrl,
  });

  return mapping;
};

const writeApplicationsToSheet = async (userId, applications, accessToken) => {
  const mapping = await getOrCreateSheet(userId, accessToken);
  const sheets = getSheetsClient(accessToken);

  const rows = applications.map((app) => [
    app.company,
    app.role,
    app.status,
    app.appliedDate ? new Date(app.appliedDate).toISOString().split('T')[0] : '',
    app.lastUpdated ? new Date(app.lastUpdated).toISOString().split('T')[0] : '',
    app.notes || '',
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: mapping.sheetId,
    range: 'Applications!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS, ...rows] },
  });

  return mapping.sheetUrl;
};

module.exports = { getOrCreateSheet, writeApplicationsToSheet };
