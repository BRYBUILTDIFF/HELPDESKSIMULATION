require("dotenv").config({ quiet: true });
const prisma = require("../src/prisma");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const { recordViolation } = require("../src/services/sessionRestrictionService");
const rollback = new Error("ROLLBACK_VERIFICATION");
async function main() {
  const [role] = await prisma.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  assert.ok(Object.values(role).every(value => !value));
  const [audit] = await prisma.$queryRaw`SELECT has_table_privilege(current_user,'"AdminAuditLog"','DELETE') AS can_delete`;
  assert.equal(audit.can_delete, false);
  try {
    await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: {email:`security-${randomUUID()}@example.invalid`, passwordHash:"test-only-unusable", firstName:"Security", lastName:"Rollback verification"} });
      const event = {userId:user.id,sessionId:randomUUID(),blocked:true,code:"SAFETY_THREAT"};
      await recordViolation(tx,event);await recordViolation(tx,event);const result=await recordViolation(tx,event);
      assert.equal(result.violations,3);assert.ok(result.expiresAt>new Date());
      const auditRow=await tx.adminAuditLog.create({data:{actorId:user.id,method:"TEST",path:"rollback-only",status:0,metadata:{test:true}}});
      await tx.adminAuditLog.update({where:{id:auditRow.id},data:{status:200}});
      throw rollback;
    });
  } catch(error) { if(error!==rollback)throw error; }
  console.log("Runtime least privilege, audit grants, and transactional cooldown checks passed; all test rows rolled back.");
}
main().catch(()=>{console.error("Database security verification failed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
