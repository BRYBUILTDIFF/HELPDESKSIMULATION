const prisma = require("../prisma");
const { redactObject } = require("../utils/redact");
const { endUserLabs } = require("../services/labLifecycleService");
async function getMySessions(req, res, next) {
  try {
    const rows = await prisma.chatSession.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: "desc" }, take: 500 });
    return res.json({ sessions: rows.map(row => row.data) });
  } catch (err) { return next(err); }
}
async function saveSession(req, res, next) {
  try {
    const data = redactObject(req.body.session);
    if (!data || Array.isArray(data) || data.id !== req.params.id || !Array.isArray(data.messages) || data.messages.length > 1000) {
      return res.status(400).json({ message: "A session with a matching id and at most 1000 messages is required." });
    }
    if (Buffer.byteLength(JSON.stringify(data)) > 200 * 1024) return res.status(413).json({ message: "This chat is too large. Start a new chat." });
    const row = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sessions:${req.user.id}`}))`;
      const existing = await tx.chatSession.findUnique({ where: { userId_id: { userId: req.user.id, id: req.params.id } } });
      if (!existing && await tx.chatSession.count({ where: { userId: req.user.id } }) >= 500) {
        const error = new Error("Session quota exceeded"); error.status = 409; error.publicMessage = "Delete an old chat before creating another."; throw error;
      }
      return tx.chatSession.upsert({ where: { userId_id: { userId: req.user.id, id: req.params.id } },
        create: { userId: req.user.id, id: req.params.id, data }, update: { data } });
    });
    return res.json({ updatedAt: row.updatedAt });
  } catch (err) { return next(err); }
}
async function deleteSession(req, res, next) {
  try {
    await endUserLabs(req.user.id, undefined, req.params.id);
    const saved = await prisma.chatSession.findUnique({ where: { userId_id: { userId: req.user.id, id: req.params.id } } });
    const labId = saved?.data?.windowsOsSimulation?.simulationSessionId;
    // The JSON is client-writable; endUserLabs checks server-owned ownership.
    if (typeof labId === "string" && labId) await endUserLabs(req.user.id, labId);
    else if (saved?.data?.windowsOsSimulation) await endUserLabs(req.user.id);
    await prisma.$transaction([
      prisma.chatSession.deleteMany({ where: { userId: req.user.id, id: req.params.id } }),
      prisma.policyConversation.deleteMany({ where: { userId: req.user.id, sessionId: req.params.id } }),
      // Legacy copies must not survive deletion.
      prisma.userSessionState.deleteMany({ where: { userId: req.user.id } })
    ]);
    return res.json({ deleted: true });
  } catch (err) { return next(err); }
}
async function deleteMyData(req, res, next) {
  try {
    await endUserLabs(req.user.id);
    await prisma.$transaction([
      prisma.chatSession.deleteMany({ where: { userId: req.user.id } }),
      prisma.userSessionState.deleteMany({ where: { userId: req.user.id } }),
      prisma.policyConversation.deleteMany({ where: { userId: req.user.id } }),
      // Preserve aggregate security evidence without retaining user text/identity.
      prisma.policyEvent.updateMany({ where: { userId: req.user.id }, data: { userId: null, userEmail: "deleted-user", message: "[deleted]", reason: "[deleted]", sessionId: null, requestId: null, metadata: require("@prisma/client").Prisma.DbNull } })
    ]);
    return res.json({ deleted: true });
  } catch (err) { return next(err); }
}
module.exports = { getMySessions, saveSession, deleteSession, deleteMyData };
