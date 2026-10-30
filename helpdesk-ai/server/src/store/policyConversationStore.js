const prisma = require("../prisma");

const memoryConversations = new Map();
let dbRetryAt = 0;
const MEMORY_LIMIT = 1000;
const CONVERSATION_TTL_MS = Math.max(60 * 60 * 1000, Number(process.env.POLICY_CONVERSATION_TTL_MS) || 24 * 60 * 60 * 1000);

function keyFor(userId, sessionId) {
  return `${Number(userId) || 0}:${String(sessionId || "").trim()}`;
}

function canUseDb() {
  return Boolean(prisma?.policyConversation) && Date.now() >= dbRetryAt;
}

async function getConversationScope(userId, sessionId) {
  const key = keyFor(userId, sessionId);
  if (!key || !String(sessionId || "").trim()) return null;

  if (canUseDb()) {
    try {
      const conversation = await prisma.policyConversation.findUnique({
        where: { userId_sessionId: { userId: Number(userId), sessionId: String(sessionId).trim() } },
        select: { scope: true, expiresAt: true }
      });
      if (conversation && conversation.expiresAt <= new Date()) {
        await prisma.policyConversation.deleteMany({ where: { userId: Number(userId), sessionId: String(sessionId).trim() } });
        return null;
      }
      return conversation?.scope || null;
    } catch (err) {
      if (["P2021", "P2022", "P1001", "P1002"].includes(err?.code)) dbRetryAt = Date.now() + 30000;
    }
  }

  const memoryConversation = memoryConversations.get(key);
  if (!memoryConversation || memoryConversation.expiresAt <= Date.now()) {
    memoryConversations.delete(key);
    return null;
  }
  return memoryConversation.scope;
}

async function markConversationScope(userId, sessionId, scope) {
  const key = keyFor(userId, sessionId);
  const safeSessionId = String(sessionId || "").trim();
  const safeScope = String(scope || "").trim();
  if (!safeSessionId || !safeScope || !Number.isInteger(Number(userId))) return;

  const expiresAt = new Date(Date.now() + CONVERSATION_TTL_MS);
  for (const [entryKey, entry] of memoryConversations) {
    if (entry.expiresAt <= Date.now()) memoryConversations.delete(entryKey);
  }
  if (!memoryConversations.has(key) && memoryConversations.size >= MEMORY_LIMIT) memoryConversations.delete(memoryConversations.keys().next().value);
  memoryConversations.set(key, { scope: safeScope, expiresAt: expiresAt.getTime() });
  if (!canUseDb()) return;

  try {
    await prisma.policyConversation.upsert({
      where: { userId_sessionId: { userId: Number(userId), sessionId: safeSessionId } },
      update: { scope: safeScope, expiresAt },
      create: { userId: Number(userId), sessionId: safeSessionId, scope: safeScope, expiresAt }
    });
  } catch (err) {
    if (["P2021", "P2022", "P1001", "P1002"].includes(err?.code)) dbRetryAt = Date.now() + 30000;
  }
}

async function removeMissingConversationScopes(userId, activeSessionIds = []) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId)) return;
  const activeIds = new Set(activeSessionIds.map((id) => String(id || "").trim()).filter(Boolean));
  for (const key of memoryConversations.keys()) {
    if (key.startsWith(`${safeUserId}:`) && !activeIds.has(key.slice(`${safeUserId}:`.length))) {
      memoryConversations.delete(key);
    }
  }
  if (!canUseDb()) return;
  try {
    await prisma.policyConversation.deleteMany({
      where: { userId: safeUserId, sessionId: { notIn: [...activeIds] } }
    });
  } catch (err) {
    if (["P2021", "P2022", "P1001", "P1002"].includes(err?.code)) dbRetryAt = Date.now() + 30000;
  }
}

module.exports = { getConversationScope, markConversationScope, removeMissingConversationScopes };
