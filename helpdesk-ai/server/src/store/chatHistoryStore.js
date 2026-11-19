const prisma = require('../prisma');
const { randomUUID } = require('crypto');
const { redactSecrets } = require('../utils/redact');
function historyFromTurns(turns) {
  return turns.flatMap(turn => [{role:'user',content:turn.message},{role:'assistant',content:turn.reply}]).slice(-10);
}
async function getChatHistory(userId, sessionId) {
  if (!sessionId) return [];
  const turns = await prisma.chatTurn.findMany({ where:{userId,sessionId}, orderBy:[{createdAt:'desc'},{id:'desc'}], take:5 });
  if(turns.length) return historyFromTurns(turns.reverse());
  // Trusted legacy cache only. Never rebuild model context from client-editable JSON.
  const row = await prisma.policyConversation.findUnique({where:{userId_sessionId:{userId,sessionId}}});
  return row?.expiresAt > new Date() && Array.isArray(row.history) ? row.history.slice(-10) : [];
}
async function appendChatTurn(userId, sessionId, message, reply, userMessageId) {
  if(!sessionId)return null;
  const data={userId,sessionId,userMessageId:typeof userMessageId==='string'&&userMessageId.length<=120?userMessageId:randomUUID(),assistantMessageId:randomUUID(),message:redactSecrets(message).slice(0,4000),reply:redactSecrets(reply).slice(0,4000)};
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sessions:${userId}`}))`;
    await require('../services/chatQuota').assertChatQuota(tx,userId,sessionId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${sessionId}`}))`;
    const turn=await tx.chatTurn.create({data});
    const recent=await tx.chatTurn.findMany({where:{userId,sessionId},orderBy:[{createdAt:'desc'},{id:'desc'}],take:5});
    const history=historyFromTurns(recent.reverse());
    const expiresAt=new Date(Date.now()+86400000);
    await tx.policyConversation.upsert({where:{userId_sessionId:{userId,sessionId}},create:{userId,sessionId,scope:'unknown',history,expiresAt},update:{history,expiresAt}});
    return turn;
  });
}
function recoverSession(data, turns) {
  const messages=[...(Array.isArray(data.messages)?data.messages:[])];
  const ids=new Set(messages.map(message=>message.id));
  for(const turn of turns) {
    if(!ids.has(turn.userMessageId)) {messages.push({id:turn.userMessageId,role:'user',type:'text',text:turn.message,time:''});ids.add(turn.userMessageId);}
    if(!ids.has(turn.assistantMessageId)) {messages.push({id:turn.assistantMessageId,role:'ai',type:'text',text:turn.reply,time:'',userPromptText:turn.message});ids.add(turn.assistantMessageId);}
  }
  return {...data,messages};
}
module.exports={getChatHistory,appendChatTurn,recoverSession,historyFromTurns};
