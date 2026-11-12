require('dotenv').config({quiet:true});const assert=require('node:assert/strict');const {randomUUID}=require('crypto');const prisma=require('../src/prisma');const {generateAccessToken}=require('../src/utils/jwt');const runtime=require('../src/services/terminalRuntime');
async function main(){let admin,user,other,moduleId;const actors=[];
 const request=async(actor,path,method='GET',body)=>{const response=await fetch('http://127.0.0.1:5000/api/'+path,{method,headers:{Authorization:'Bearer '+generateAccessToken({id:actor.id,tokenVersion:actor.tokenVersion}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data};};
 try{
 for(const role of ['ADMIN','USER','USER'])actors.push(await prisma.user.create({data:{email:'terminal-'+randomUUID()+'@example.invalid',passwordHash:'test-only-unusable',firstName:'Terminal verification',lastName:'Disposable',role}}));[admin,user,other]=actors;
 let result=await request(admin,'admin/simulation-modules','POST',{mode:'manual',title:'Terminal verification '+randomUUID(),category:'Security test',simulation:runtime.accountDefinition()});assert.equal(result.status,201);moduleId=result.data.module.id;
 const route='simulations/modules/'+moduleId;
 assert.equal((await request(user,route+'/attempts','POST')).status,404);
 assert.equal((await request(admin,'admin/simulation-modules/'+moduleId,'PATCH',{enabled:true})).status,400);
 assert.equal((await request(user,'admin/simulation-modules/test','POST',{simulation:runtime.accountDefinition(),actions:[]})).status,403);
 const definition=runtime.accountDefinition();const actions=definition.steps.map((s,i)=>({kind:s.type,step:i,command:s.expectedCommands[0]||''}));
 let tested=await request(admin,'admin/simulation-modules/test','POST',{simulation:definition,actions});assert.equal(tested.status,200);assert.ok(tested.data.testToken);
 const token=tested.data.testToken;const changed=JSON.parse(JSON.stringify(definition));changed.steps[0].title+=' changed';
 assert.equal((await request(admin,'admin/simulation-modules/'+moduleId,'PATCH',{simulation:changed,testToken:token,enabled:true})).status,400);
 result=await request(admin,'admin/simulation-modules/'+moduleId,'PATCH',{simulation:definition,testToken:token,enabled:true});assert.equal(result.status,200);
 result=await request(user,route+'/attempts','POST');assert.equal(result.status,201);let attempt=result.data;const path=route+'/attempts/'+attempt.attemptKey;
 assert.equal((await request(other,path)).status,410);
 assert.equal((await request(user,route+'/complete','POST',{attemptKey:attempt.attemptKey,surface:'windows-terminal',stepsCompleted:6})).status,409);
 result=await request(user,path+'/commands','POST',{kind:'command',step:2,command:definition.steps[2].expectedCommands[0]});assert.equal(result.status,200);assert.equal(result.data.accepted,false);assert.equal(result.data.mistakes,1);
 for(const action of actions){result=await request(user,path+'/commands','POST',action);assert.equal(result.status,200);assert.equal(result.data.accepted,true);attempt=result.data;}
 assert.equal(attempt.completed,true);assert.equal(attempt.state.locked,false);assert.equal(attempt.state.passwordReset,true);
 result=await request(user,path+'/commands','POST',actions[2]);assert.equal(result.data.replayed,true);assert.equal(result.data.nextStep,6);
 const resumed=await request(user,path);assert.equal(resumed.data.nextStep,6);assert.equal(resumed.data.events.length,7);
 result=await request(user,route+'/complete','POST',{attemptKey:attempt.attemptKey,surface:'windows-terminal',stepsCompleted:0});assert.equal(result.status,200);assert.equal(result.data.recorded,true);
 result=await request(user,route+'/complete','POST',{attemptKey:attempt.attemptKey,surface:'windows-terminal',stepsCompleted:0});assert.equal(result.data.recorded,false);
 assert.equal((await request(user,path+'/end','POST')).data.status,'COMPLETED');
 await prisma.simulationAttempt.update({where:{id:attempt.attemptKey},data:{expiresAt:new Date(0)}});
 const review=await request(user,path);assert.equal(review.status,200);assert.equal(review.data.status,'COMPLETED');assert.equal(review.data.definition.steps.length,6);
 const started=await request(user,route+'/attempts','POST');const endedPath=route+'/attempts/'+started.data.attemptKey;
 assert.equal((await request(user,endedPath+'/end','POST')).status,200);
 assert.equal((await request(user,endedPath+'/commands','POST',actions[0])).status,409);
 const expired=await request(user,route+'/attempts','POST');await prisma.simulationAttempt.update({where:{id:expired.data.attemptKey},data:{expiresAt:new Date(0)}});assert.equal((await request(user,route+'/attempts/'+expired.data.attemptKey)).status,410);
 const invalid=runtime.accountDefinition();invalid.steps[1].expectedCommands=['net user [username] /domain and press enter'];assert.equal((await request(admin,'admin/simulation-modules/test','POST',{simulation:invalid,actions:[]})).status,400);
 console.log('Live terminal audit passed: draft gating, admin role, validated exact-definition test receipts, state transitions, wrong-step mistakes, ownership, resume, duplicate submission, completion idempotency, ended/expired attempts, and malformed definitions. No real OS command or AI call executed.');
 }finally{if(moduleId){await prisma.simulationAttempt.deleteMany({where:{moduleId}});await prisma.simulationCompletion.deleteMany({where:{moduleId}});await prisma.simulationModule.delete({where:{id:moduleId}});}for(const actor of actors)await prisma.user.delete({where:{id:actor.id}});await prisma.$disconnect();}}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});

