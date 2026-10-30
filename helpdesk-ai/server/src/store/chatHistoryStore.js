const prisma = require("../prisma");

async function getChatHistory(userId, sessionId) {
  if (!sessionId) return [];
  const row = await prisma.policyConversation.findUnique({
    where: { userId_sessionId: { userId, sessionId } }
  });
  if (!row || row.expiresAt <= new Date()) return [];
  return Array.isArray(row.history) ? row.history.slice(-10) : [];
}

async function appendChatTurn(userId, sessionId, message, reply) {
  if (!sessionId) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${sessionId}`}))`;
    const row = await tx.policyConversation.findUnique({ where: { userId_sessionId: { userId, sessionId } } });
    const prior = row?.expiresAt > new Date() && Array.isArray(row.history) ? row.history : [];
    const history = [...prior, { role: "user", content: message.slice(0, 4000) }, { role: "assistant", content: reply.slice(0, 4000) }].slice(-10);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.policyConversation.upsert({
      where: { userId_sessionId: { userId, sessionId } },
      create: { userId, sessionId, scope: "unknown", history, expiresAt },
      update: { history, expiresAt }
    });
  });
}

module.exports = { getChatHistory, appendChatTurn };
