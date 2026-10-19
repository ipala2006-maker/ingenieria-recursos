const crypto = require('node:crypto');

function key() {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('DRIVE_NOT_CONFIGURED');
  return Buffer.from(raw, 'hex');
}
function seal(value, purpose) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('estudiemos.drive.v1:' + purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
function unseal(raw, purpose) {
  if (typeof raw !== 'string' || raw.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('INVALID_DRIVE_CREDENTIAL');
  const bytes = Buffer.from(raw, 'base64url');
  if (bytes.length < 29) throw new Error('INVALID_DRIVE_CREDENTIAL');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from('estudiemos.drive.v1:' + purpose)); cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}
module.exports = { seal, unseal };
