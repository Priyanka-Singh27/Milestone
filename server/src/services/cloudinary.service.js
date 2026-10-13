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
 
// Best-effort cleanup: the Certificate model only stores fileUrl (per
// CONTRACTS.md 4.3), so we read the resource type and public_id from the
// URL itself, e.g. .../image/upload/v123/certificates/u1/abc.pdf
// - image/video resources: public_id has no file extension
// - raw resources: public_id keeps the extension
// If parsing fails we just log and move on — deleting the DB record is
// what actually matters to the user.
const tryDeleteFromUrl = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    const match = fileUrl.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return;
    const resourceType = match[1];
    let publicId = match[2];
    if (resourceType !== 'raw') {
      publicId = publicId.replace(/\.[a-zA-Z0-9]+$/, '');
    }
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary cleanup failed (non-blocking):', err.message);
  }
};
 
module.exports = { uploadBuffer, tryDeleteFromUrl };
 