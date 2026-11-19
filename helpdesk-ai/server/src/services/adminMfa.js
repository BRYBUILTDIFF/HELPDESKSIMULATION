const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { seal, open } = require('../utils/encryptedSecret');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = ''; for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map(chunk => alphabet[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}
function decode32(value) {
  const bits = [...value].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  return Buffer.from((bits.match(/.{8}/g) || []).map(chunk => parseInt(chunk, 2)));
}
function totp(secret, counter) {
  const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', decode32(secret)).update(buffer).digest();
  return String((hmac.readUInt32BE(hmac[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
function matchCounter(secret, code, last = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter > Number(last) && crypto.timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter;
  }
  return null;
}
function required() { return process.env.ADMIN_MFA_REQUIRED === 'true' || (process.env.NODE_ENV === 'production' && process.env.ADMIN_MFA_REQUIRED !== 'false'); }
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function issueProof(user, secret) {
  return jwt.sign({ purpose: 'admin-mfa', id: user.id, version: user.tokenVersion || 0, fingerprint: hash(secret), verifiedAt: Date.now() }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', audience: 'admin-step-up', issuer: 'helpdesk-security', expiresIn: '1h' });
}
function verifyProof(token, user, secret) {
  try {
    const payload = jwt.verify(token || '', process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: 'admin-step-up', issuer: 'helpdesk-security' });
    if (payload.purpose !== 'admin-mfa' || payload.id !== user.id || payload.version !== (user.tokenVersion || 0) || payload.fingerprint !== hash(secret)) return null;
    return payload;
  } catch { return null; }
}
async function guard(req, res, next) {
  if (!required()) return next();
  try {
    const [record] = await require('../prisma').$queryRaw`SELECT "secret" FROM "AdminSecurity" WHERE "userId"=${req.user.id}`;
    const proof = record?.secret && verifyProof(req.headers['x-admin-verification'], req.user, record.secret);
    if (!proof) return res.status(403).json({ code: 'ADMIN_MFA_REQUIRED', message: 'Verify your administrator identity to continue.' });
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && Date.now() - proof.verifiedAt > 5 * 60000) return res.status(403).json({ code: 'ADMIN_STEP_UP_REQUIRED', message: 'Verify again before changing administrator data. Your changes were not submitted.' });
    return next();
  } catch (error) { next(error); }
}
module.exports = { base32, totp, matchCounter, required, issueProof, verifyProof, guard, hash, seal, open };
