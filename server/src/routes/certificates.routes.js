const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const {
  uploadCertificate,
  createBadge,
  getCertificates,
  deleteCertificate,
} = require('../controllers/certificates.controller');

router.post('/upload', upload.single('file'), uploadCertificate);
router.post('/badge', createBadge);
router.get('/', getCertificates);
router.delete('/:id', deleteCertificate);

module.exports = router;