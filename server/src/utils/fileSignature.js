// server/src/utils/fileSignature.js
//
// A browser-supplied MIME type is trivial to fake. This checks the first bytes
// of the uploaded file ("magic numbers") against what it claims to be.

function startsWith(buf, bytes) {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
}

const CHECKS = {
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // DOCX is a ZIP container
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) =>
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
};

function matchesSignature(buffer, mimetype) {
  const check = CHECKS[mimetype];
  return Boolean(check && Buffer.isBuffer(buffer) && check(buffer));
}

module.exports = { matchesSignature };
