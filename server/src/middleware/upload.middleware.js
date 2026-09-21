const multer = require('multer');

// Memory storage — we stream the buffer straight to Cloudinary, never touch disk.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

module.exports = upload;
