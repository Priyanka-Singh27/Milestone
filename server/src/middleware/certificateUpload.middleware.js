const multer = require('multer');

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter,
});

module.exports = upload;