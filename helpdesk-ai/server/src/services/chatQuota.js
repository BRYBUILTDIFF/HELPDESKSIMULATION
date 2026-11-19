const { bounded } = require('./aiRequestContext');
async function assertChatQuota(tx, userId, sessionId) {
  const [counts] = await tx.$queryRaw`SELECT COUNT(*)::int AS turns, COUNT(*) FILTER (WHERE "sessionId"=${sessionId})::int AS "sessionTurns" FROM "ChatTurn" WHERE "userId"=${userId}`;
  const [conversations] = await tx.$queryRaw`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE id=${sessionId})::int AS existing FROM (SELECT "sessionId" AS id FROM "ChatTurn" WHERE "userId"=${userId} UNION SELECT id FROM "ChatSession" WHERE "userId"=${userId}) c`;
  if (counts.turns >= bounded('CHAT_MAX_ACCOUNT_TURNS', 10000, 10, 100000) || counts.sessionTurns >= bounded('CHAT_MAX_SESSION_TURNS', 500, 5, 1000) || (!conversations.existing && conversations.total >= bounded('CHAT_MAX_CONVERSATIONS', 100, 1, 500))) {
    const error = new Error('Chat storage quota reached'); error.status = 409; error.publicMessage = 'Your chat storage limit has been reached. Delete an old conversation before continuing.'; throw error;
  }
}
async function chatQuota(req, _res, next) {
  try { await assertChatQuota(require('../prisma'), req.user.id, req.body.sessionId); next(); }
  catch (error) { next(error); }
}
module.exports = { assertChatQuota, chatQuota };
