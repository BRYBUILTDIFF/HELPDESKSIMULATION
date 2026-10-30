const prisma = require("../prisma");
const { prunePolicyEvents } = require("../store/policyEventStore");

async function cleanupRetainedData() {
  const days = Math.max(1, Number(process.env.POLICY_RETENTION_DAYS) || 90);
  const cutoff = new Date(Date.now() - days * 86400000);
  prunePolicyEvents(cutoff);
  await prisma.policyEvent.deleteMany({ where: { at: { lt: cutoff } } });
  await prisma.policyConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

module.exports = { cleanupRetainedData };
