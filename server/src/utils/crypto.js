// server/src/utils/crypto.js
//
// AES-256-GCM helpers for secrets stored in the database (Google refresh tokens).
// Key = SHA-256 of TOKEN_ENCRYPTION_KEY (falls back to JWT_SECRET).

const crypto = require('crypto');

function key() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set.');
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload) {
  const [iv, tag, enc] = String(payload).split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Constant-time string comparison (for API keys). */
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

module.exports = { encrypt, decrypt, safeEqual };
