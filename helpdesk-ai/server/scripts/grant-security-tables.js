// Add new runtime grants without rotating any existing role/password.
if (!process.argv.includes('--env-file')) throw new Error('Provide an explicit maintenance file');
require('./owner-config');
const {PrismaClient}=require('@prisma/client');
if(!process.env.ADMIN_DATABASE_URL)throw new Error('ADMIN_DATABASE_URL is required');
const db=new PrismaClient({datasources:{db:{url:process.env.ADMIN_DATABASE_URL}}});
(async()=>{
  await db.$transaction(async tx=>{
    for(const table of ['SecurityLease','AdminSecurity'])await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO helpdesk_runtime`);
  });
  console.log('Security table grants applied. Existing credentials unchanged.');
})().catch(()=>{console.error('Security table grant failed. Check migration and maintenance permissions.');process.exitCode=1;}).finally(()=>db.$disconnect());
