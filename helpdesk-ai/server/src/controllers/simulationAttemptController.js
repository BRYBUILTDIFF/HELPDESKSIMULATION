const prisma = require('../prisma');
const {getModuleById}=require('../store/simulationModuleStore');
const runtime=require('../services/terminalRuntime');
async function startAttempt(req,res,next){try{
 const module=await getModuleById(req.params.id);if(!module?.enabled)return res.status(404).json({message:'Simulation module not found'});
 const definition=runtime.assertDefinition(module.simulation);
 const attempt=await prisma.simulationAttempt.create({data:{userId:req.user.id,moduleId:module.id,surface:definition.surface,expected:runtime.newRuntime(definition),expiresAt:new Date(Date.now()+2*3600000)}});
 return res.status(201).json(runtime.snapshot(attempt));
}catch(e){next(e);}}
async function getAttempt(req,res,next){try{
 const attempt=await prisma.simulationAttempt.findFirst({where:{id:req.params.attemptId,userId:req.user.id,moduleId:req.params.id}});
 const completion = attempt && await prisma.simulationCompletion.findUnique({where:{attemptKey:attempt.id}});
 const completed = Boolean(attempt && (attempt.expected?.status === 'COMPLETED' || (completion?.userId === req.user.id && completion?.moduleId === req.params.id)));
 if(!attempt||(!completed && attempt.expiresAt<=new Date())||attempt.expected?.version!==2)return res.status(410).json({message:'This attempt expired or uses an older module format. Restart the simulation.',code:'ATTEMPT_EXPIRED'});
 return res.json(runtime.snapshot(completed ? {...attempt,expected:{...attempt.expected,status:"COMPLETED"}} : attempt));
}catch(e){next(e);}}
async function submitCommand(req,res,next){try{
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.attemptId}))`;
  const attempt=await tx.simulationAttempt.findFirst({where:{id:req.params.attemptId,userId:req.user.id,moduleId:req.params.id}});
  if(!attempt||attempt.expiresAt<=new Date()||attempt.expected?.version!==2)return null;
  if(attempt.expected.status!=='ACTIVE')return {status:409,message:'This attempt has ended. Restart to practice again.'};
  const input={step:req.body.step,kind:req.body.kind||'command',command:req.body.command};
  // A repeated successful action is idempotent only when its kind and command agree.
  const previous=attempt.expected.events.find(e=>e.step===input.step&&e.accepted&&e.kind===input.kind&&(input.kind==='checkpoint'||runtime.canonicalCommand(e.command)===runtime.canonicalCommand(input.command)));
  if(input.step<attempt.nextStep&&previous)return {...runtime.snapshot(attempt),accepted:true,output:previous.output,replayed:true};
  const changed=runtime.advance(attempt.expected,attempt.nextStep,input);
  const updated=await tx.simulationAttempt.update({where:{id:attempt.id},data:{expected:changed.runtime,nextStep:changed.nextStep,...(!changed.accepted&&!changed.utility?{mistakes:{increment:1}}:{})}});
  return {...runtime.snapshot(updated),accepted:changed.accepted,output:changed.output,clear:changed.clear||false};
 });
 if(!result)return res.status(410).json({message:'Attempt not found, expired, or outdated. Restart the simulation.',code:'ATTEMPT_EXPIRED'});
 if(result.status===409)return res.status(409).json(result);
 return res.json(result);
}catch(e){next(e);}}
async function endAttempt(req,res,next){try{
 const result=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.params.attemptId}))`;const row=await tx.simulationAttempt.findFirst({where:{id:req.params.attemptId,userId:req.user.id,moduleId:req.params.id}});if(!row||row.expected?.version!==2)return null;if(row.expected.status==='COMPLETED')return row;return tx.simulationAttempt.update({where:{id:row.id},data:{expected:{...row.expected,status:'ENDED'}}});});
 if(!result)return res.status(404).json({message:'Attempt not found'});return res.json(runtime.snapshot(result));
}catch(e){next(e);}}
async function testDefinition(req,res,next){try{
 const definition=require('../store/simulationModuleStore').normalizeSimulation(req.body.simulation);
 const r=runtime.newRuntime(definition);let current=r;let index=0;let mistakes=0;let output='Test started. Complete each action below.';
 if(!Array.isArray(req.body.actions)||req.body.actions.length>120)return res.status(400).json({message:'Provide up to 120 test actions.'});
 for(const action of req.body.actions){if(!action||!['command','checkpoint'].includes(action.kind)||!Number.isInteger(action.step)||String(action.command||'').length>1000)return res.status(400).json({message:'Invalid test action.'});const changed=runtime.advance(current,index,action);current=changed.runtime;index=changed.nextStep;output=changed.output;if(!changed.accepted&&!changed.utility)mistakes++;}
 const completed=index===definition.steps.length;
 return res.json({definition,nextStep:index,state:current.state,events:current.events,mistakes,output,completed,testToken:completed?runtime.signTest(definition,req.user.id):null});
}catch(e){next(e);}}
module.exports={startAttempt,getAttempt,submitCommand,endAttempt,testDefinition};
