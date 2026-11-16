// server/src/utils/safeError.js
//
// Never leak database or library internals to the browser in production.

function safeMessage(err) {
  if (process.env.NODE_ENV === 'production') return 'An unexpected error occurred.';
  return (err && err.message) || 'An unexpected error occurred.';
}

module.exports = { safeMessage };
