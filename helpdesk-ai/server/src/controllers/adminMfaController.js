const crypto = require('crypto');
const prisma = require('../prisma');
const { comparePassword } = require('../utils/password');
const mfa = require('../services/adminMfa');
async function password(req) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.isActive || user.role !== 'ADMIN' || !(await comparePassword(String(req.body.password || ''), user.passwordHash))) {
    const error = new Error('Verification failed'); error.status = 403; error.publicMessage = 'Administrator verification failed.'; throw error;
  }
  return user;
}
async function status(req, res, next) {
  try {
    const [record] = await prisma.$queryRaw`SELECT "secret" FROM "AdminSecurity" WHERE "userId"=${req.user.id}`;
    const proof = record?.secret && mfa.verifyProof(req.headers['x-admin-verification'], req.user, record.secret);
    res.json({ required: mfa.required(), enrolled: !!record?.secret, verified: !!proof, recent: !!proof && Date.now() - proof.verifiedAt <= 5 * 60000 });
  } catch (error) { next(error); }
}
async function enroll(req, res, next) {
  try {
    await password(req);
    const secret = mfa.base32(crypto.randomBytes(20));
    const encrypted = mfa.seal(secret, `mfa:${req.user.id}`);
    const changed = await prisma.$executeRaw`INSERT INTO "AdminSecurity" ("userId","pendingSecret","pendingExpiresAt") VALUES (${req.user.id},${encrypted},${new Date(Date.now()+600000)}) ON CONFLICT ("userId") DO UPDATE SET "pendingSecret"=EXCLUDED."pendingSecret","pendingExpiresAt"=EXCLUDED."pendingExpiresAt" WHERE "AdminSecurity"."secret" IS NULL`;
    if (!changed) return res.status(409).json({ message: 'An authenticator is already enrolled. Use verification or a recovery code.' });
    res.json({ secret, account: req.user.email, issuer: 'HelpDesk AI' });
  } catch (error) { next(error); }
}
async function verify(req, res, next) {
  try {
    const user = await password(req);
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mfa:${user.id}`}))`;
      const [record] = await tx.$queryRaw`SELECT * FROM "AdminSecurity" WHERE "userId"=${user.id} FOR UPDATE`;
      if (!record) return null;
      const enrolling = !record.secret;
      if (enrolling && (!record.pendingSecret || record.pendingExpiresAt < new Date())) return null;
      const encrypted = enrolling ? record.pendingSecret : record.secret;
      const counter = mfa.matchCounter(mfa.open(encrypted, `mfa:${user.id}`), req.body.code, record.lastCounter);
      if (counter === null) return null;
      const recoveryCodes = enrolling ? Array.from({length:8},()=>crypto.randomBytes(12).toString('hex')) : null;
      if (enrolling) await tx.$executeRaw`UPDATE "AdminSecurity" SET "secret"=${encrypted},"pendingSecret"=NULL,"pendingExpiresAt"=NULL,"lastCounter"=${BigInt(counter)},"recoveryHashes"=${JSON.stringify(recoveryCodes.map(mfa.hash))}::jsonb WHERE "userId"=${user.id}`;
      else await tx.$executeRaw`UPDATE "AdminSecurity" SET "lastCounter"=${BigInt(counter)} WHERE "userId"=${user.id}`;
      return { verificationToken: mfa.issueProof(user, encrypted), recoveryCodes };
    });
    if (!result) return res.status(400).json({ message: 'Verification failed. Use a new authenticator code or restart expired enrollment.' });
    console.info('Admin MFA verified', { userId: user.id });
    res.json(result);
  } catch (error) { next(error); }
}
async function recover(req, res, next) {
  try {
    const user = await password(req);
    const digest = mfa.hash(String(req.body.code || '').trim());
    const recovered = await prisma.$transaction(async tx => {
      const [record] = await tx.$queryRaw`SELECT * FROM "AdminSecurity" WHERE "userId"=${user.id} FOR UPDATE`;
      if (!record?.secret || !Array.isArray(record.recoveryHashes) || !record.recoveryHashes.includes(digest)) return false;
      // Recovery removes the factor but does NOT grant admin access. Re-enroll.
      await tx.$executeRaw`DELETE FROM "AdminSecurity" WHERE "userId"=${user.id}`;
      await tx.user.update({ where:{id:user.id},data:{tokenVersion:{increment:1}} });
      await tx.refreshToken.deleteMany({where:{userId:user.id}});
      return true;
    });
    if (!recovered) return res.status(400).json({message:'Administrator recovery failed.'});
    console.info('Admin MFA recovered; sessions revoked', {userId:user.id});
    res.json({message:'Recovery completed. Sign in again and enroll your new authenticator.'});
  } catch(error) {next(error);}
}
module.exports = { status, enroll, verify, recover };
