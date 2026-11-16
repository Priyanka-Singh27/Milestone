// server/src/middleware/errorHandler.middleware.js
//
// Central error handler. Always answers with the standard JSON error shape and
// never leaks stack traces or database internals.

const { fail } = require('../utils/respond');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);

  if (err.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return fail(res, 400, 'FILE_TOO_LARGE', 'Uploaded file exceeds the size limit.');
  }
  if (err.name === 'MongoServerError' && err.code === 11000) {
    return fail(res, 409, 'CONFLICT', 'A resource with that value already exists.');
  }
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map((e) => e.message).join('; ');
    return fail(res, 400, 'VALIDATION_ERROR', message);
  }
  if (err.name === 'CastError') {
    return fail(res, 400, 'INVALID_INPUT', 'One of the values has the wrong format.');
  }

  console.error('[errorHandler]', err);
  return fail(res, 500, 'SERVER_ERROR', 'An unexpected error occurred.');
}

module.exports = errorHandler;
