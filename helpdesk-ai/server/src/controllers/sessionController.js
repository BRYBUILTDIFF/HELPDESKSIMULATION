const prisma = require("../prisma");
const { removeMissingConversationScopes } = require("../store/policyConversationStore");

function normalizeSessions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item) => item && typeof item === "object");
}

async function getMySessions(req, res, next) {
  try {
    const state = await prisma.userSessionState.findUnique({
      where: { userId: req.user.id },
      select: { sessions: true, updatedAt: true }
    });

    return res.status(200).json({
      sessions: normalizeSessions(state?.sessions),
      updatedAt: state?.updatedAt || null
    });
  } catch (err) {
    return next(err);
  }
}

async function saveMySessions(req, res, next) {
  try {
    const sessions = normalizeSessions(req.body?.sessions);

    const updated = await prisma.userSessionState.upsert({
      where: { userId: req.user.id },
      update: { sessions },
      create: {
        userId: req.user.id,
        sessions
      },
      select: { sessions: true, updatedAt: true }
    });
    await removeMissingConversationScopes(req.user.id, sessions.map((session) => session.id));

    return res.status(200).json({
      sessions: normalizeSessions(updated.sessions),
      updatedAt: updated.updatedAt
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMySessions,
  saveMySessions
};
