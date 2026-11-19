const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const url=process.env.SECURITY_BASELINE_TEST_DATABASE_URL;
if(!url)test('security baseline integration',{skip:'Set SECURITY_BASELINE_TEST_DATABASE_URL to an isolated migrated local test database'},()=>{});
else {
 const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));assert.match(parsed.pathname,/^\/security_baseline_test_/);
 process.env.DATABASE_URL=url;process.env.SECURITY_ENCRYPTION_KEY='b'.repeat(64);process.env.JWT_ACCESS_SECRET='integration-only-access-secret-at-least-32-characters';process.env.ADMIN_MFA_REQUIRED='true';
 const db=require('../src/prisma');const mfa=require('../src/services/adminMfa');const controller=require('../src/controllers/adminMfaController');
 const {hashPassword}=require('../src/utils/password');const {aiResources}=require('../src/middleware/aiResources');const {appendChatTurn}=require('../src/store/chatHistoryStore');
 const password='a unique integration passphrase';let admin;
 const response=()=>Object.assign(new EventEmitter(),{status(code){this.code=code;return this;},json(body){this.body=body;return this;},headersSent:false});
 const call=async(fn,req)=>{const res=response();await fn(req,res,error=>{throw error;});return res;};
 after(()=>db.$disconnect());
 test('MFA enrollment, replay rejection, guard and recovery operate on real PostgreSQL',async()=>{
  admin=await db.user.create({data:{email:'admin@baseline.invalid',passwordHash:await hashPassword(password),firstName:'Test',lastName:'Admin',role:'ADMIN'}});
  const req={user:admin,body:{password},headers:{}};
  const enrollment=await call(controller.enroll,req);assert.ok(enrollment.body.secret);
  const code=mfa.totp(enrollment.body.secret,Math.floor(Date.now()/30000));
  const verified=await call(controller.verify,{...req,body:{password,code}});assert.equal(verified.body.recoveryCodes.length,8);
  const replay=await call(controller.verify,{...req,body:{password,code}});assert.equal(replay.code,400);
  let admitted=false;await mfa.guard({...req,method:'GET',headers:{'x-admin-verification':verified.body.verificationToken}},response(),()=>{admitted=true;});assert.ok(admitted);
  const denied=response();await mfa.guard({...req,method:'GET'},denied,()=>assert.fail('Missing factor admitted'));assert.equal(denied.code,403);
  const jwt=require('jsonwebtoken');
  const proof=jwt.verify(verified.body.verificationToken,process.env.JWT_ACCESS_SECRET);
  delete proof.iat;delete proof.exp;proof.verifiedAt=Date.now()-6*60000;
  const old=jwt.sign(proof,process.env.JWT_ACCESS_SECRET,{algorithm:'HS256',expiresIn:'1h'});
  const stale=response();await mfa.guard({...req,method:'POST',headers:{'x-admin-verification':old}},stale,()=>assert.fail('Stale step-up admitted'));assert.equal(stale.body.code,'ADMIN_STEP_UP_REQUIRED');
  const recovered=await call(controller.recover,{...req,body:{password,code:verified.body.recoveryCodes[0]}});assert.ok(recovered.body.message);
  assert.equal((await db.user.findUnique({where:{id:admin.id}})).tokenVersion,1);
  const reuse=await call(controller.recover,{...req,body:{password,code:verified.body.recoveryCodes[0]}});assert.equal(reuse.code,400);
 });
 test('shared AI leases reject concurrent work and release on response completion',async()=>{
  const user={id:admin.id};const first=response();let entered=false;
  await aiResources({user},first,error=>{if(error)throw error;entered=true;});assert.ok(entered);
  let blocked;await aiResources({user},response(),error=>{blocked=error;});assert.equal(blocked.status,429);
  first.emit('finish');await new Promise(resolve=>setTimeout(resolve,50));
  const [count]=await db.$queryRaw`SELECT COUNT(*)::int AS total FROM "SecurityLease"`;assert.equal(count.total,0);
 });
 test('quota enforcement serializes racing appends and applies across new session IDs',async()=>{
  process.env.CHAT_MAX_SESSION_TURNS='5';process.env.CHAT_MAX_CONVERSATIONS='1';
  for(let i=0;i<4;i++)await appendChatTurn(admin.id,'first','question','answer');
  const results=await Promise.allSettled([appendChatTurn(admin.id,'first','question','answer'),appendChatTurn(admin.id,'first','question','answer')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  await assert.rejects(appendChatTurn(admin.id,'second','question','answer'),error=>error.status===409);
  assert.equal(await db.chatTurn.count({where:{userId:admin.id}}),5);
 });
 test('conversation pagination includes saved and recovered sessions without cross-user rows',async()=>{
  const controller=require('../src/controllers/sessionController');
  for(let i=0;i<7;i++)await db.chatSession.create({data:{id:'page-'+i,userId:admin.id,data:{id:'page-'+i,messages:[]}}});
  const another=await db.user.create({data:{email:'another@baseline.invalid',passwordHash:'test-only',firstName:'Another',lastName:'User'}});
  await db.chatSession.create({data:{id:'private',userId:another.id,data:{id:'private',messages:[]}}});
  const first=await call(controller.getMySessions,{user:admin,query:{}});assert.equal(first.body.sessions.length,5);assert.ok(first.body.nextCursor);
  const second=await call(controller.getMySessions,{user:admin,query:{cursor:first.body.nextCursor}});assert.equal(second.body.sessions.length,3);assert.equal(second.body.nextCursor,null);
  assert.ok(![...first.body.sessions,...second.body.sessions].some(session=>session.id==='private'));
 });
 test('owner MFA reset preserves accounts/data, requires apply and revokes existing sessions',async()=>{
  const {resetAdminMfa}=require('../scripts/reset-admin-mfa');
  await db.$executeRaw`INSERT INTO "AdminSecurity" ("userId","secret") VALUES (${admin.id},'test-factor')`;
  await db.refreshToken.create({data:{userId:admin.id,token:'test-only-refresh-hash',expiresAt:new Date(Date.now()+60000)}});
  const before=await db.user.findUnique({where:{id:admin.id}});
  const preview=await resetAdminMfa(db,admin.email);assert.equal(preview.reset,false);assert.equal(preview.enrolled,true);
  const result=await resetAdminMfa(db,admin.email,true);assert.equal(result.reset,true);
  const after=await db.user.findUnique({where:{id:admin.id}});assert.equal(after.passwordHash,before.passwordHash);assert.equal(after.tokenVersion,before.tokenVersion+1);
  assert.equal(await db.refreshToken.count({where:{userId:admin.id}}),0);assert.equal(await db.chatTurn.count({where:{userId:admin.id}}),5);
  await assert.rejects(resetAdminMfa(db,'another@baseline.invalid',true),/active administrator/);
 });
}
