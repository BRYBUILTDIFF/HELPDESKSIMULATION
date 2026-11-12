const prisma = require("../prisma");
const WINDOW_MS = 15 * 60000;
const COOLDOWN_MS = 10 * 60000;
function safetyViolation(event) {
  return event.blocked && /^SAFETY_/.test(event.code || "") && !/UNAVAILABLE/.test(event.code);
}
async function getRestriction(userId, sessionId) {
  if (!sessionId) return null;
  const row = await prisma.sessionRestriction.findUnique({ where: { userId_sessionId: { userId, sessionId } } });
  return row?.expiresAt > new Date() ? row : null;
}
async function recordViolation(tx, event, now = new Date()) {
  if (!event.userId || !event.sessionId || !safetyViolation(event)) return null;
  const key = { userId: event.userId, sessionId: event.sessionId };
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`restriction:${event.userId}:${event.sessionId}`}))`;
  const previous = await tx.sessionRestriction.findUnique({ where: { userId_sessionId: key } });
  if (previous?.expiresAt > now) return previous;
  const inWindow = previous && !previous.expiresAt && now - previous.windowStart < WINDOW_MS;
  const violations = inWindow ? previous.violations + 1 : 1;
  const data = { violations, windowStart: inWindow ? previous.windowStart : now,
    expiresAt: violations >= 3 ? new Date(now.getTime() + COOLDOWN_MS) : null,
    reason: violations >= 3 ? "Repeated safety-blocked requests" : null };
  return tx.sessionRestriction.upsert({ where: { userId_sessionId: key }, create: { ...key, ...data }, update: data });
}
module.exports = { getRestriction, recordViolation, safetyViolation, WINDOW_MS, COOLDOWN_MS };
