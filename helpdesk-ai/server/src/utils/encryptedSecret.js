const crypto = require('crypto');
function encryptionKey() {
  const value = process.env.SECURITY_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) { const error=new Error('SECURITY_ENCRYPTION_KEY must contain 32 random hex-encoded bytes');error.code='SECURITY_ENCRYPTION_KEY_INVALID';throw error; }
  return Buffer.from(value, 'hex');
}
function seal(value, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64url')).join('.');
}
function open(value, purpose) {
  const parts = value.split('.').map(part => Buffer.from(part, 'base64url'));
  if (parts.length !== 3) throw new Error('Invalid encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), parts[0]);
  decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8');
}
module.exports = { encryptionKey, seal, open };
