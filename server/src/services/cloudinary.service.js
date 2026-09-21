const cloudinary = require('../config/cloudinary');

const uploadBuffer = (fileBuffer, folder = 'certificates') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(fileBuffer);
  });
};

const tryDeleteFromUrl = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    const match = fileUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    if (!match) return;
    await cloudinary.uploader.destroy(match[1], { resource_type: 'auto' });
  } catch (err) {
    console.error('Cloudinary cleanup failed (non-blocking):', err.message);
  }
};

module.exports = { uploadBuffer, tryDeleteFromUrl };
