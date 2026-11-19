const fs=require('fs');
const {spawnSync}=require('child_process');
const {PrismaClient}=require('@prisma/client');
const dotenv=require('dotenv');
// Explicit local maintenance target only. Never load the Render owner file.
const value=process.env.SECURITY_TEST_ADMIN_URL || dotenv.parse(fs.readFileSync('.security/owner.env')).ADMIN_DATABASE_URL;
const target=new URL(value);
if(!['localhost','127.0.0.1'].includes(target.hostname))throw new Error('Security verification requires a local PostgreSQL owner');
const name=`security_baseline_test_${Date.now()}`;
const admin=new PrismaClient({datasources:{db:{url:value}}});
(async()=>{
 let created=false;
 try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created=true;target.pathname='/'+name;
  const env={...process.env,DATABASE_URL:target.href,SECURITY_BASELINE_TEST_DATABASE_URL:target.href};
  const migrate=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env,encoding:'utf8'});
  if(migrate.status!==0)throw new Error('Isolated migration failed');
  const suite=spawnSync(process.execPath,['--test','test/securityBaseline.integration.js'],{env,stdio:'inherit'});
  if(suite.status!==0)process.exitCode=1;
 } finally {
  if(created)await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
 }
})().catch(()=>{console.error('Isolated security verification failed. No connection details printed.');process.exitCode=1;});
