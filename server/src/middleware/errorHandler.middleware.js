// Catches errors thrown by any middleware/route — including Multer's
// file-size/type errors, which occur before a controller's own try/catch
// can run — and always responds in the standard { success, error } shape,
// never a raw HTML stack trace. Must be registered LAST in app.js, after
// every route.
const multer = require('multer');

const errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error.';
    if (err.code === 'LIMIT_FILE_SIZE') message = 'File is too large (max 10MB).';
    if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'Unexpected file field.';
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message },
    });
  }

  if (err && err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: 'Unsupported file type. Allowed: PDF, JPG, PNG.' },
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'SERVER_ERROR', message: err.message || 'Something went wrong.' },
  });
};

module.exports = errorHandler;