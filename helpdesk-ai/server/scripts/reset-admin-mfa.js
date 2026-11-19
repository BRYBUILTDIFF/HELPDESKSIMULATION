// Owner-only recovery. Never import this into the HTTP application.
async function resetAdminMfa(db, email, apply = false) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide the exact administrator email');
  return db.$transaction(async tx => {
    const user = await tx.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,role:true,isActive:true}});
    if (!user || user.role !== 'ADMIN' || !user.isActive) throw new Error('Target is not an active administrator');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mfa:${user.id}`}))`;
    const [state] = await tx.$queryRaw`SELECT ("secret" IS NOT NULL) AS enrolled, ("pendingSecret" IS NOT NULL) AS pending FROM "AdminSecurity" WHERE "userId"=${user.id} FOR UPDATE`;
    if (!apply || !state) return {enrolled:!!state?.enrolled,pending:!!state?.pending,reset:false};
    await tx.$executeRaw`DELETE FROM "AdminSecurity" WHERE "userId"=${user.id}`;
    await tx.user.update({where:{id:user.id},data:{tokenVersion:{increment:1}}});
    await tx.refreshToken.deleteMany({where:{userId:user.id}});
    // Actor 0 identifies an out-of-band owner operation, not the target admin.
    await tx.adminAuditLog.create({data:{actorId:0,method:'MAINTENANCE',path:`/maintenance/admin-mfa-reset/${user.id}`,status:200,metadata:{actorRole:'DATABASE_OWNER',targetUserId:user.id,operation:'MFA_RESET'}}});
    return {enrolled:!!state.enrolled,pending:!!state.pending,reset:true};
  });
}
async function main() {
  const args=process.argv.slice(2);
  if (!args.includes('--env-file') || !args.includes('--email')) throw new Error('Use --env-file and --email; add --apply only to reset');
  require('./owner-config');
  if(!process.env.ADMIN_DATABASE_URL)throw new Error('The explicit maintenance file must contain ADMIN_DATABASE_URL');
  const {PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:process.env.ADMIN_DATABASE_URL}}});
  try {
    const result=await resetAdminMfa(db,args[args.indexOf('--email')+1],args.includes('--apply'));
    if(result.reset)console.log('Administrator MFA reset. Sessions revoked. Password and application data unchanged. Sign in and enroll a new authenticator.');
    else if(!result.enrolled&&!result.pending)console.log('No authenticator enrollment exists for this administrator. Nothing reset. Investigate frontend deployment or login errors.');
    else console.log('Authenticator enrollment exists. Dry run only: add --apply to reset this administrator and revoke their sessions.');
  }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(()=>{console.error('Owner MFA recovery failed. Check target email, maintenance credentials, database access and migrations privately. No secrets printed.');process.exitCode=1;});
module.exports={resetAdminMfa};
