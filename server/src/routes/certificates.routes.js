// server/src/routes/certificates.routes.js
//
// Students: upload / list / delete their own certificates.
// Badges:   created ONLY by the quiz module (internal key), never by a student.

const express = require('express');
const router = express.Router();

const upload = require('../middleware/certificateUpload.middleware');
const { requireAuth, requireInternal } = require('../middleware/auth.middleware');
const { uploadLimiter } = require('../middleware/security.middleware');
const { fail } = require('../utils/respond');
const {
  uploadCertificate,
  createBadge,
  getCertificates,
  deleteCertificate,
} = require('../controllers/certificates.controller');

const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.message === 'INVALID_FILE_TYPE') {
      return fail(res, 400, 'INVALID_FILE_TYPE', 'Unsupported file type. Allowed: PDF, JPG, PNG.');
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, 400, 'UPLOAD_ERROR', 'File is too large (max 10MB).');
    }
    return fail(res, 400, 'UPLOAD_ERROR', 'File upload error.');
  });
};

// INTERNAL ONLY — registered before requireAuth so it is not reachable with a user token.
router.post('/badge', requireInternal, createBadge);

router.use(requireAuth);
router.post('/upload', uploadLimiter, handleUpload, uploadCertificate);
router.get('/', getCertificates);
router.delete('/:id', deleteCertificate);

module.exports = router;
