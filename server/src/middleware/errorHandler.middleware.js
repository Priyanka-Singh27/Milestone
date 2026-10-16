// server/src/middleware/errorHandler.middleware.js
//
// Central Express error handler — mounted last in app.js.
// Catches errors thrown or passed via next(err) from any route.
//
// Special cases handled:
//   - multer LIMIT_FILE_SIZE  -> 400 FILE_TOO_LARGE
//   - MongoServerError code 11000 (duplicate key) -> 409 to avoid leaking
//     internals (callers should catch EMAIL_TAKEN before this fires)
//   - All others -> 500 SERVER_ERROR

const { fail } = require('../utils/respond');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // multer file-size limit
  if (err.code === 'LIMIT_FILE_SIZE') {
    return fail(res, 400, 'FILE_TOO_LARGE', 'Uploaded file exceeds the size limit.');
  }

  // Mongoose duplicate-key (e.g. race condition on email)
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return fail(res, 409, 'CONFLICT', 'A resource with that value already exists.');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join('; ');
    return fail(res, 400, 'VALIDATION_ERROR', message);
  }

  // Everything else
  console.error('[errorHandler]', err);
  return fail(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
}

module.exports = errorHandler;
