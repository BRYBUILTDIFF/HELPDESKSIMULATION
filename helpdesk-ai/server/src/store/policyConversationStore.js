const prisma = require("../prisma");
async function getConversationScope(userId, sessionId) {
  if (!sessionId) return null;
  const row = await prisma.policyConversation.findUnique({ where: { userId_sessionId: { userId: Number(userId), sessionId: String(sessionId) } } });
  return row?.expiresAt > new Date() ? row.scope : null;
}
async function markConversationScope(userId, sessionId, scope) {
  if (!sessionId) return;
  const expiresAt = new Date(Date.now() + 86400000);
  await prisma.policyConversation.upsert({ where: { userId_sessionId: { userId: Number(userId), sessionId } },
    create: { userId: Number(userId), sessionId, scope, expiresAt }, update: { scope, expiresAt } });
}
async function removeMissingConversationScopes(userId, ids = []) {
  await prisma.policyConversation.deleteMany({ where: { userId: Number(userId), sessionId: { notIn: ids } } });
}
module.exports = { getConversationScope, markConversationScope, removeMissingConversationScopes };
