const prisma = require("../prisma");
async function cleanupRetainedData() {
  const cutoff = new Date(Date.now() - Math.max(1, Number(process.env.POLICY_RETENTION_DAYS) || 90) * 86400000);
  const chatCutoff = new Date(Date.now() - Math.max(1, Number(process.env.CHAT_RETENTION_DAYS) || 90) * 86400000);
  await prisma.policyEvent.deleteMany({ where: { at: { lt: cutoff } } });
  await prisma.policyConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.chatSession.deleteMany({ where: { updatedAt: { lt: chatCutoff } } });
  await prisma.userSessionState.deleteMany({ where: { updatedAt: { lt: chatCutoff } } });
  await prisma.simulationAttempt.deleteMany({ where: { expiresAt: { lt: chatCutoff } } });
  await prisma.requestLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  // Runtime may insert/read audit records and update status, but cannot delete them.
  // Archive/prune audit history with a separately authorized maintenance identity.
  await prisma.sessionRestriction.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 86400000) },
    OR: [{ expiresAt: null }, { expiresAt: { lt: new Date() } }] } });
}
module.exports = { cleanupRetainedData };
