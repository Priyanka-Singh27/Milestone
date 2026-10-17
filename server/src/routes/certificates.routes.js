const express = require('express');
const router = express.Router();
const upload = require('../middleware/certificateUpload.middleware');
const {
  uploadCertificate,
  createBadge,
  getCertificates,
  deleteCertificate,
} = require('../controllers/certificates.controller');
 
// Runs multer and answers upload problems with the standard JSON error
// shape right here, so this route does not depend on app.js registering
// a global error handler.
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
 
    if (err.message === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Unsupported file type. Allowed: PDF, JPG, PNG.' },
      });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: 'File is too large (max 10MB).' },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: err.message || 'File upload error.' },
    });
  });
};
 
router.post('/upload', handleUpload, uploadCertificate);
router.post('/badge', createBadge);
router.get('/', getCertificates);
router.delete('/:id', deleteCertificate);
 
module.exports = router;
 