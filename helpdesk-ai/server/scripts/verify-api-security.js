require("dotenv").config({ quiet: true });
const prisma = require("../src/prisma");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const { generateAccessToken } = require("../src/utils/jwt");
const { recordViolation } = require("../src/services/sessionRestrictionService");
async function main() {
  const users = [];
  const sessionId = `security-${randomUUID()}`;
  const origin = process.env.SECURITY_TEST_ORIGIN || "http://127.0.0.1:5000";
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Verification targets must be local.");
  try {
    for (const role of ["USER", "USER", "ADMIN"]) {
      users.push(await prisma.user.create({data:{email:`security-${randomUUID()}@example.invalid`,passwordHash:"test-only-unusable",firstName:"Security verification",lastName:"Disposable",role}}));
    }
    const request = async (user, route, method = "GET", body) => fetch(`${origin}${route}`, {
      method, headers:{Authorization:`Bearer ${generateAccessToken({id:user.id,tokenVersion:user.tokenVersion})}`,"Content-Type":"application/json"},
      ...(body ? {body:JSON.stringify(body)} : {})
    });
    assert.equal((await request(users[1],"/api/admin/users")).status,403);
    assert.equal((await request(users[0],`/api/sessions/${sessionId}`,"PUT",{session:{id:sessionId,messages:[]}})).status,200);
    const other = await request(users[1],"/api/sessions");
    assert.ok(!(await other.json()).sessions.some(row=>row.id===sessionId));
    await request(users[1],`/api/sessions/${sessionId}`,"DELETE");
    assert.ok(await prisma.chatSession.findUnique({where:{userId_id:{userId:users[0].id,id:sessionId}}}));
    await prisma.$transaction(async tx => {
      for(let i=0;i<3;i++)await recordViolation(tx,{userId:users[0].id,sessionId,blocked:true,code:"SAFETY_THREAT"});
    });
    const blocked = await request(users[0],"/api/ai/chat","POST",{sessionId,message:"Help with VPN"});
    assert.equal(blocked.status,429);assert.equal((await blocked.json()).code,"SESSION_COOLDOWN");
    assert.equal((await request(users[1],`/api/admin/session-restrictions/${users[0].id}/reset`,"POST",{sessionId})).status,403);
    assert.equal((await request(users[2],`/api/admin/session-restrictions/${users[0].id}/reset`,"POST",{sessionId})).status,200);
    assert.equal(await prisma.sessionRestriction.findUnique({where:{userId_sessionId:{userId:users[0].id,sessionId}}}),null);
    assert.equal((await request(users[0],"/api/ai/chat","POST",{message:"Help with VPN"})).status,400);
    console.log("Live local API checks passed: cross-user isolation, admin denial, session cooldown, admin reset, and required session identity. No AI call or lab launch was made.");
  } finally {
    for(const user of users)await prisma.user.delete({where:{id:user.id}});
    await prisma.$disconnect();
  }
}
main().catch(()=>{console.error("API security verification failed; inspect isolated test results.");process.exitCode=1;});
