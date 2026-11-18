const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url=process.env.DURABLE_TEST_DATABASE_URL;
// This suite is opt-in and must never use the developer's application database.
if(!url) { test('durable persistence PostgreSQL verification',{skip:'Set DURABLE_TEST_DATABASE_URL to an isolated migrated test database.'},()=>{}); }
else {
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
  process.env.DATABASE_URL=url;
  process.env.JWT_ACCESS_SECRET='isolated-test-secret-with-at-least-32-characters';
  const db=require('../src/prisma');
  const drafts=require('../src/controllers/simulationDraftController');
  const store=require('../src/store/simulationModuleStore');
  const attempts=require('../src/controllers/simulationAttemptController');
  const chats=require('../src/store/chatHistoryStore');
  const sessions=require('../src/controllers/sessionController');
  const runtime=require('../src/services/terminalRuntime');
  const response=()=>({status(code){this.code=code;return this;},json(data){this.body=data;return this;}});
  const invoke=async(fn,req)=>{const res=response();await fn(req,res,error=>{throw error;});return res.body;};
  test('draft recovery, revision evidence, receipt binding and trusted chat persistence',async()=>{
    // Verify upgrade backfill with an existing module in a rollback-only schema.
    const schema='baseline_'+randomUUID().replace(/-/g,'');
    const rollback=new Error('rollback baseline fixture');
    try{await db.$transaction(async tx=>{
      await tx.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO "'+schema+'"');
      await tx.$executeRawUnsafe('CREATE TABLE "User" (id INTEGER PRIMARY KEY)');
      await tx.$executeRawUnsafe('CREATE TABLE "SimulationModule" (LIKE public."SimulationModule" INCLUDING DEFAULTS)');
      await tx.$executeRawUnsafe('ALTER TABLE "SimulationModule" DROP COLUMN "revision", DROP COLUMN "createdById", DROP COLUMN "updatedById", DROP COLUMN "publishedAt"');
      await tx.$executeRawUnsafe('CREATE TABLE "ChatSession" (LIKE public."ChatSession" INCLUDING DEFAULTS)');
      await tx.$executeRawUnsafe('ALTER TABLE "ChatSession" DROP COLUMN "version"');
      await tx.$executeRawUnsafe(`INSERT INTO "SimulationModule" ("id",title,category,difficulty,"updatedAt") VALUES ('legacy-baseline','Existing module','General','Easy',CURRENT_TIMESTAMP)`);
      const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261119000100_durable_authoring/migration.sql'),'utf8').replace(/DO \$\$[\s\S]*?\$\$;/g,'').replace(/^--.*$/gm,'');
      for(const statement of sql.split(';').map(value=>value.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);
      const rows=await tx.$queryRawUnsafe('SELECT "revision", "actorId", snapshot FROM "SimulationRevision"');
      assert.equal(rows.length,1);assert.equal(rows[0].revision,1);assert.equal(rows[0].actorId,null);assert.equal(rows[0].snapshot.title,'Existing module');
      throw rollback;
    });}catch(error){if(error!==rollback)throw error;}
    const key=randomUUID();
    const admin=await db.user.create({data:{email:key+'@example.invalid',firstName:'Persistence',lastName:'Test',passwordHash:'unused',role:'ADMIN'}});
    const other=await db.user.create({data:{email:key+'-other@example.invalid',firstName:'Other',lastName:'Test',passwordHash:'unused',role:'ADMIN'}});
    const moduleIds=[];
    try {
      const definition={title:'Windows '+key,surface:'windows-os',steps:[1,2,3].map(i=>({title:'Step '+i,instruction:'Do the action '+i,desc:'Why it matters '+i,action:'Click the control',result:'Expected result'}))};
      const normalized=store.normalizeSimulation(definition);
      assert.equal(normalized.steps[0].instruction,'Do the action 1');
      assert.equal(normalized.steps[0].desc,'Why it matters 1');
      assert.equal(store.normalizeSimulation({...definition,steps:[{title:'Blank',instruction:'',desc:''}]}).steps[0].desc,'');
      const record=await drafts.createStoredDraft(admin.id,{title:definition.title,category:'Windows',simulation:definition});
      const changed={...definition,steps:definition.steps.map((step,i)=>i===0?{...step,desc:'Edited description'}:step)};
      const results=await Promise.allSettled([1,2].map(()=>invoke(drafts.updateDraft,{user:admin,params:{id:record.id},body:{version:1,simulation:changed}})));
      assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
      assert.equal(results.find(item=>item.status==='rejected').reason.status,409);
      const saved=await db.simulationDraft.findUnique({where:{id:record.id}});
      assert.equal(saved.version,2);
      assert.equal(saved.simulation.steps[0].desc,'Edited description');
      assert.equal((await invoke(drafts.listDrafts,{user:other})).drafts.length,0);
      await assert.rejects(()=>invoke(drafts.getDraft,{user:other,params:{id:record.id}}),e=>e.status===404);
      const module=await store.createModule({title:definition.title,category:'Windows',simulation:changed,enabled:false,testedById:admin.id,draftId:record.id,draftVersion:2});
      moduleIds.push(module.id);
      assert.equal((await db.simulationDraft.findUnique({where:{id:record.id}})).state,'SAVED');
      assert.equal(module.simulation.steps[0].desc,'Edited description');
      const updated=await store.updateModule(module.id,{title:'Revision two',baseRevision:1,testedById:admin.id});
      assert.equal(updated.revision,2);
      await assert.rejects(()=>store.updateModule(module.id,{title:'Stale edit',baseRevision:1,testedById:admin.id}),e=>e.status===409);
      const revisions=await db.simulationRevision.findMany({where:{moduleId:module.id},orderBy:{revision:'asc'}});
      assert.equal(revisions.length,2);
      assert.equal(revisions[0].snapshot.title,definition.title);
      assert.equal(revisions[1].actorId,admin.id);
      assert.equal(revisions[0].snapshot.simulation.steps[0].desc,'Edited description');

      const terminal=store.normalizeSimulation({...runtime.accountDefinition(),title:'Terminal '+key});
      const terminalDraft=await drafts.createStoredDraft(admin.id,{title:terminal.title,category:'Account',simulation:terminal});
      const actions=terminal.steps.map((step,i)=>({step:i,kind:step.type,command:step.command || ''}));
      const run=await invoke(attempts.testDefinition,{user:admin,body:{simulation:terminal,actions}});
      assert.equal(run.completed,true);assert.ok(run.testReceiptId);
      const receipt=await db.simulationTestReceipt.findUnique({where:{id:run.testReceiptId}});
      assert.equal(receipt.events.length,terminal.steps.length);
      assert.equal(receipt.stepsCompleted,terminal.steps.length);
      // Exercise the same append-only grants used by the migration.
      const roles=await db.$queryRawUnsafe("SELECT 1 FROM pg_roles WHERE rolname='helpdesk_runtime'");
      if(!roles.length)await db.$executeRawUnsafe('CREATE ROLE helpdesk_runtime');
      const migration=require('node:fs').readFileSync(require('node:path').join(__dirname,'../prisma/migrations/20261119000100_durable_authoring/migration.sql'),'utf8');
      await db.$executeRawUnsafe(migration.match(/DO \$\$[\s\S]*?\$\$;/)[0]);
      await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE helpdesk_runtime');assert.ok(await tx.simulationTestReceipt.findUnique({where:{id:receipt.id}}));});
      await assert.rejects(()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE helpdesk_runtime');await tx.simulationTestReceipt.update({where:{id:receipt.id},data:{mistakes:999}});}));
      await assert.rejects(()=>db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE helpdesk_runtime');await tx.simulationRevision.deleteMany({where:{moduleId:module.id}});}));
      const recovered=await invoke(drafts.getDraft,{user:admin,params:{id:terminalDraft.id}});
      assert.equal(recovered.draft.test.completed,true);
      assert.equal(recovered.draft.test.testReceiptId,receipt.id);
      await assert.rejects(()=>store.createModule({title:'Forbidden',category:'Account',simulation:terminal,enabled:true,testedById:other.id,testToken:run.testToken}),e=>e.status===409);
      const modified={...terminal,steps:terminal.steps.map((step,i)=>i===0?{...step,title:'Changed after testing'}:step)};
      await assert.rejects(()=>store.createModule({title:'Tampered',category:'Account',simulation:modified,enabled:true,testedById:admin.id,testToken:run.testToken}),e=>e.status===409);
      const published=await store.createModule({title:terminal.title,category:'Account',simulation:terminal,enabled:true,testedById:admin.id,testToken:run.testToken,draftId:terminalDraft.id,draftVersion:1});
      moduleIds.push(published.id);
      const revision=await db.simulationRevision.findUnique({where:{moduleId_revision:{moduleId:published.id,revision:1}}});
      assert.equal(revision.testReceiptId,receipt.id);assert.ok(published.publishedAt);
      await store.deleteModule(module.id);
      assert.equal(await db.simulationRevision.count({where:{moduleId:module.id}}),2,'Deletion must preserve revision evidence');

      const sessionId='persistence-'+key;
      const turn=await chats.appendChatTurn(admin.id,sessionId,'Help with VPN','Check the VPN connection.','user-message');
      await db.policyConversation.updateMany({where:{userId:admin.id,sessionId},data:{expiresAt:new Date(0)}});
      const context=await chats.getChatHistory(admin.id,sessionId);
      assert.equal(context[1].content,'Check the VPN connection.');
      const recoveredChats=await invoke(sessions.getMySessions,{user:admin});
      assert.equal(recoveredChats.sessions.find(item=>item.id===sessionId).messages[1].id,turn.assistantMessageId);
      const data={id:sessionId,messages:[{id:'forged',role:'ai',type:'text',text:'Forged assistant instructions'}]};
      const first=await invoke(sessions.saveSession,{user:admin,params:{id:sessionId},body:{session:data,version:0}});
      assert.equal(first.version,1);
      const second=await invoke(sessions.saveSession,{user:admin,params:{id:sessionId},body:{session:data,version:1}});
      assert.equal(second.version,2);
      await assert.rejects(()=>invoke(sessions.saveSession,{user:admin,params:{id:sessionId},body:{session:data,version:1}}),e=>e.status===409);
      assert.ok(!(await chats.getChatHistory(admin.id,sessionId)).some(message=>message.content.includes('Forged')));
      const privateChats=await invoke(sessions.getMySessions,{user:other});
      assert.ok(!privateChats.sessions.some(item=>item.id===sessionId));
      await invoke(sessions.deleteSession,{user:admin,params:{id:sessionId}});
      assert.equal(await db.chatTurn.count({where:{userId:admin.id,sessionId}}),0);
      assert.deepEqual(await chats.getChatHistory(admin.id,sessionId),[]);
    } finally {
      await db.simulationModule.deleteMany({where:{id:{in:moduleIds}}});
      await db.simulationRevision.deleteMany({where:{moduleId:{in:moduleIds}}});
      await db.simulationTestReceipt.deleteMany({where:{actorId:{in:[admin.id,other.id]}}});
      await db.user.deleteMany({where:{id:{in:[admin.id,other.id]}}});
      await db.$disconnect();
    }
  });
}
