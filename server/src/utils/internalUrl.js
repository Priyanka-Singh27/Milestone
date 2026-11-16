// server/src/utils/internalUrl.js
//
// INTERNAL_API_URL is how this server calls itself (dashboard -> modules, quiz
// -> skills/certificates). Different files used to expect different shapes
// (with and without "/api/v1"), so one value could never satisfy both.
// These helpers accept either form.

function internalOrigin() {
  const raw =
    process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 5000}`;
  return raw.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
}

function internalApiBase() {
  return `${internalOrigin()}/api/v1`;
}

module.exports = { internalOrigin, internalApiBase };
