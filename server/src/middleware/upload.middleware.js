// server/src/middleware/upload.middleware.js
//
// Resume upload (PDF or DOCX, 5 MB). Multer errors are answered here with the
// standard JSON shape, and the file's real signature is checked as well as the
// claimed MIME type.

const multer = require('multer');
const { fail } = require('../utils/respond');
const { matchesSignature } = require('../utils/fileSignature');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    return cb(new Error('INVALID_FILE_TYPE'));
  },
});

function handleResumeUpload(req, res, next) {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return fail(res, 400, 'FILE_TOO_LARGE', 'The resume is too large (max 5 MB).');
      }
      if (err.message === 'INVALID_FILE_TYPE') {
        return fail(res, 400, 'INVALID_FILE_TYPE', 'Only PDF and DOCX resumes are supported.');
      }
      return fail(res, 400, 'UPLOAD_ERROR', 'The resume could not be uploaded.');
    }
    if (req.file && !matchesSignature(req.file.buffer, req.file.mimetype)) {
      return fail(res, 400, 'INVALID_FILE_TYPE', 'That file does not look like a real PDF or DOCX.');
    }
    return next();
  });
}

module.exports = upload;
module.exports.handleResumeUpload = handleResumeUpload;
