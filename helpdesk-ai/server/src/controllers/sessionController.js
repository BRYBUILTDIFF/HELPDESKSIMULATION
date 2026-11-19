const prisma = require("../prisma");
const { redactObject } = require("../utils/redact");
const { endUserLabs } = require("../services/labLifecycleService");
async function getMySessions(req, res, next) {
  try {
    const cursor = typeof req.query?.cursor === 'string' ? req.query.cursor : '';
    if(cursor.length>120)return res.status(400).json({message:'Invalid conversation cursor.'});
    const page = await prisma.$queryRaw`SELECT id FROM (SELECT id FROM "ChatSession" WHERE "userId"=${req.user.id} UNION SELECT "sessionId" AS id FROM "ChatTurn" WHERE "userId"=${req.user.id}) c WHERE id > ${cursor} ORDER BY id LIMIT 6`;
    const idsForPage=page.slice(0,5).map(row=>row.id);
    const rows = await prisma.chatSession.findMany({ where: { userId: req.user.id, id:{in:idsForPage} }, orderBy: { updatedAt: "desc" } });
    const turns=await prisma.chatTurn.findMany({where:{userId:req.user.id,sessionId:{in:idsForPage}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    const groups=new Map();
    for(const turn of turns.reverse()){if(!groups.has(turn.sessionId))groups.set(turn.sessionId,[]);groups.get(turn.sessionId).push(turn);}
    const recover=require('../store/chatHistoryStore').recoverSession;
    const sessions=rows.map(row=>recover(row.data,groups.get(row.id)||[]));
    const ids=new Set(rows.map(row=>row.id));
    for(const [id,history] of groups){if(!ids.has(id)&&sessions.length<500)sessions.push(recover({id,title:history[0].message.slice(0,42),createdAt:history[0].createdAt,updatedAt:history[history.length-1].createdAt,messages:[]},history));}
    return res.json({sessions,versions:Object.fromEntries(rows.map(row=>[row.id,row.version])),nextCursor:page.length>5?idsForPage[idsForPage.length-1]:null});
  } catch (err) { return next(err); }
}
async function saveSession(req, res, next) {
  try {
    let data = redactObject(req.body.session);
    if (!data || Array.isArray(data) || data.id !== req.params.id || !Array.isArray(data.messages) || data.messages.length > 1000) {
      return res.status(400).json({ message: "A session with a matching id and at most 1000 messages is required." });
    }
    if (Buffer.byteLength(JSON.stringify(data)) > 200 * 1024) return res.status(413).json({ message: "This chat is too large. Start a new chat." });
    const row = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sessions:${req.user.id}`}))`;
      const existing = await tx.chatSession.findUnique({ where: { userId_id: { userId: req.user.id, id: req.params.id } } });
      if(existing && req.body.version!==existing.version) {
        const error=new Error('This chat changed in another tab. Reload before saving further changes.');error.status=409;error.publicMessage=error.message;throw error;
      }
      if (!existing && await tx.chatSession.count({ where: { userId: req.user.id } }) >= 500) {
        const error = new Error("Session quota exceeded"); error.status = 409; error.publicMessage = "Delete an old chat before creating another."; throw error;
      }
      if (!existing) await require('../services/chatQuota').assertChatQuota(tx, req.user.id, req.params.id);
      const turns=await tx.chatTurn.findMany({where:{userId:req.user.id,sessionId:req.params.id},orderBy:[{createdAt:'asc'},{id:'asc'}]});
      data=require('../store/chatHistoryStore').recoverSession(data,turns);
      if(data.messages.length>1000 || Buffer.byteLength(JSON.stringify(data))>200*1024){const error=new Error('This chat is full. Start a new chat.');error.status=413;error.publicMessage=error.message;throw error;}
      return tx.chatSession.upsert({ where: { userId_id: { userId: req.user.id, id: req.params.id } },
        create: { userId: req.user.id, id: req.params.id, data }, update: { data, version: { increment: 1 } } });
    });
    return res.json({ updatedAt: row.updatedAt, version: row.version });
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
      prisma.chatTurn.deleteMany({ where: { userId: req.user.id, sessionId: req.params.id } }),
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
      prisma.chatTurn.deleteMany({ where: { userId: req.user.id } }),
      // Preserve aggregate security evidence without retaining user text/identity.
      prisma.policyEvent.updateMany({ where: { userId: req.user.id }, data: { userId: null, userEmail: "deleted-user", message: "[deleted]", reason: "[deleted]", sessionId: null, requestId: null, metadata: require("@prisma/client").Prisma.DbNull } })
    ]);
    return res.json({ deleted: true });
  } catch (err) { return next(err); }
}
module.exports = { getMySessions, saveSession, deleteSession, deleteMyData };
