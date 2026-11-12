const { createHash, createHmac, timingSafeEqual } = require('crypto');
const { normalizeCommand } = require('../utils/simulationCommands');
const ACTIONS = {
 'terminal.open-admin': {type:'checkpoint', surface:'windows-terminal', command:'', output:'Simulated administrator session opened.'},
 'account.inspect': {type:'command',surface:'windows-terminal',command:'Get-ADUser -Identity jdoe -Properties LockedOut'},
 'account.unlock': {type:'command',surface:'windows-terminal',command:'Unlock-ADAccount -Identity jdoe'},
 'account.reset-password': {type:'command',surface:'windows-terminal',command:'Set-ADAccountPassword -Identity jdoe -Reset -NewPassword (ConvertTo-SecureString "Training-Only-42!" -AsPlainText -Force)'},
 'account.verify': {type:'command',surface:'windows-terminal',command:'Get-ADUser -Identity jdoe -Properties LockedOut,PasswordLastSet'},
 'account.test-login': {type:'checkpoint',surface:'windows-terminal',command:'',output:'Simulated login succeeded for fictional account jdoe.'},
 'mac.terminal.open-admin': {type:'checkpoint', surface:'mac-terminal',command:'',output:'Simulated administrator terminal opened.'},
 'mac.network.inspect': {type:'command',surface:'mac-terminal',command:'networksetup -getdnsservers Wi-Fi'},
 'mac.network.flush-dns': {type:'command',surface:'mac-terminal',command:'sudo dscacheutil -flushcache'},
 'mac.network.test': {type:'command',surface:'mac-terminal',command:'dig intranet.company.local'},
 'network.inspect': {type:'command',surface:'windows-terminal',command:'ipconfig /all'},
 'network.flush-dns': {type:'command',surface:'windows-terminal',command:'ipconfig /flushdns'},
 'network.test': {type:'command',surface:'windows-terminal',command:'nslookup intranet.company.local'},
 'system.identity': {type:'command',surface:'any',command:'whoami'}
};
function canonicalCommand(input){return (String(input || '').trim().match(/"[^"]*"|'[^']*'|\S+/g)||[]).map(token=>/^["']/.test(token)?token:token.toLowerCase()).join(' ').replace(/\s*,\s*/g,',');}
function initialState(){return {elevated:false,locked:true,passwordReset:false,dnsBroken:true};}
function execute(actionId, state){
 const next={...state};let output='';
 if(actionId==='terminal.open-admin'||actionId==='mac.terminal.open-admin'){next.elevated=true;output=ACTIONS[actionId].output;}
 if(actionId.startsWith('account.')&&!next.elevated)return {ok:false,state,output:'Open the simulated administrator session first.'};
 if(actionId==='account.inspect'||actionId==='account.verify')output='SamAccountName: jdoe\nLockedOut: '+next.locked+'\nPassword reset in this attempt: '+next.passwordReset;
 if(actionId==='account.unlock'){next.locked=false;output='Account jdoe unlocked.';}
 if(actionId==='account.reset-password'){if(next.locked)return {ok:false,state,output:'Unlock the account before resetting its training password.'};next.passwordReset=true;output='Training password reset for fictional account jdoe.';}
 if(actionId==='account.verify'&&(next.locked||!next.passwordReset))return {ok:false,state,output:output+'\nRecovery is not complete.'};
 if(actionId==='account.test-login'){if(next.locked||!next.passwordReset)return {ok:false,state,output:'Simulated login failed: account recovery is incomplete.'};output=ACTIONS[actionId].output;}
 if(actionId==='network.inspect'||actionId==='mac.network.inspect')output='IPv4: 10.0.0.42\nGateway: 10.0.0.1\nDNS cache: '+(next.dnsBroken?'stale':'healthy');
 if(actionId==='network.flush-dns'||actionId==='mac.network.flush-dns'){next.dnsBroken=false;output='Successfully flushed the simulated DNS cache.';}
 if(actionId==='network.test'||actionId==='mac.network.test'){output=next.dnsBroken?'DNS lookup failed: stale cache.':'intranet.company.local -> 10.0.0.10';if(next.dnsBroken)return {ok:false,state,output};}
 if(actionId==='system.identity')output='TRAINING\\student';
 return {ok:true,state:next,output};
}
function withExpectedOutputs(definition){
 let state=initialState();
 return {...definition,steps:(definition.steps||[]).map(step=>{
  if(!Object.hasOwn(ACTIONS,step.actionId))return step;
  const result=execute(step.actionId,state);state=result.state;
  return {...step,expectedOutput:typeof step.expectedOutput==='string'&&step.expectedOutput.trim()?step.expectedOutput:result.output};
 })};
}
function validateDefinition(definition){
 const errors=[];const steps=definition?.steps;
 if(!['windows-terminal','mac-terminal'].includes(definition?.surface))errors.push('Choose a supported terminal surface.');
 if(!Array.isArray(steps)||!steps.length||steps.length>12)errors.push('Provide between 1 and 12 steps.');
 let state=initialState();
 for(const [index,step] of (Array.isArray(steps)?steps:[]).entries()){
  const action=Object.hasOwn(ACTIONS,step.actionId)?ACTIONS[step.actionId]:null;const label='Step '+(index+1)+': ';
  if(!action){errors.push(label+'unsupported action. Select a supported action from the catalog.');continue;}
  if(action.surface!=='any'&&action.surface!==definition.surface)errors.push(label+'action does not support this terminal surface.');
  if(step.type!==action.type)errors.push(label+'assessment type must be '+action.type+'.');
  if(!step.title||String(step.title).length>200)errors.push(label+'provide a title of at most 200 characters.');
  const commands=step.expectedCommands;
  if(action.type==='command'&&(!Array.isArray(commands)||commands.length!==1||canonicalCommand(commands[0])!==canonicalCommand(action.command)))errors.push(label+'expectedCommands must contain the catalog command exactly.');
  if(action.type==='checkpoint'&&Array.isArray(commands)&&commands.length)errors.push(label+'checkpoints cannot require commands.');
  const result=execute(step.actionId,state);if(!result.ok)errors.push(label+result.output);
  if(typeof step.expectedOutput === "string" && step.expectedOutput.trim().replace(/\r\n/g,"\n") !== result.output.trim())errors.push(label+"Expected output does not match the simulated state. Restore the generated output or change the action/order.");
  state=result.state;
 }
 return errors;
}
function assertDefinition(definition){const errors=validateDefinition(definition);if(errors.length){const e=new Error(errors.join(' '));e.status=400;e.validationErrors=errors;throw e;}return definition;}
function definitionHash(definition){return createHash('sha256').update(JSON.stringify(definition)).digest('hex');}
function newRuntime(definition){assertDefinition(definition);return {version:2,definition,hash:definitionHash(definition),state:initialState(),events:[],status:'ACTIVE'};}
function advance(runtime,nextStep,input){
 const step=runtime.definition.steps[nextStep];const action=step&&ACTIONS[step.actionId];
 if(!action)return {accepted:false,nextStep,runtime,output:'All steps are complete. Record your completion.'};
 if(input.kind==='command'&&['help','cls','clear'].includes(normalizeCommand(input.command))){return {accepted:false,utility:true,nextStep,runtime,output:normalizeCommand(input.command)==='help'?'Required action: '+(action.command||'Use the checkpoint button.'):'',clear:normalizeCommand(input.command)!=='help'};}
 let accepted=input.step===nextStep&&input.kind===action.type&&(action.type==='checkpoint'||canonicalCommand(input.command)===canonicalCommand(action.command));
 let result={state:runtime.state,output:input.step!==nextStep?'Follow the required step '+(nextStep+1)+'.':'Expected: '+(action.command||'Use the checkpoint button.')};
 if(accepted){result=execute(step.actionId,runtime.state);accepted=result.ok;}
 const event={step:nextStep,kind:input.kind,command:input.kind==='command'?String(input.command).slice(0,1000):null,accepted,output:result.output,at:new Date().toISOString()};
 return {accepted,nextStep:nextStep+(accepted?1:0),output:result.output,runtime:{...runtime,state:accepted?result.state:runtime.state,events:[...runtime.events,event].slice(-200)}};
}
function snapshot(attempt){const r=attempt.expected;return {attemptKey:attempt.id,nextStep:attempt.nextStep,expiresAt:attempt.expiresAt,mistakes:attempt.mistakes,status:r.status,definition:withExpectedOutputs(r.definition),state:r.state,events:r.events,completed:attempt.nextStep===r.definition.steps.length};}
function signTest(definition,userId){const value=Buffer.from(JSON.stringify({hash:definitionHash(definition),userId,expires:Date.now()+3600000})).toString('base64url');return value+'.'+createHmac('sha256',process.env.JWT_ACCESS_SECRET).update(value).digest('base64url');}
function verifyTest(token,definition,userId){try{const [value,sig]=String(token||'').split('.');const expected=createHmac('sha256',process.env.JWT_ACCESS_SECRET).update(value).digest('base64url');if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;const payload=JSON.parse(Buffer.from(value,'base64url'));return payload.hash===definitionHash(definition)&&payload.userId===userId&&payload.expires>Date.now();}catch{return false;}}
function accountDefinition(){const ids=['terminal.open-admin','account.inspect','account.unlock','account.reset-password','account.verify','account.test-login'];const titles=['Open simulated administrator session','Inspect account lockout','Unlock the account','Reset the training password','Verify account recovery','Test simulated login'];return {title:'Account Lockout Resolution',scenarioType:'general',surface:'windows-terminal',terminalType:'windows-terminal',steps:ids.map((actionId,i)=>({title:titles[i],desc:'Training environment with fictional domain account jdoe. No real account is changed.',type:ACTIONS[actionId].type,actionId,expectedCommands:ACTIONS[actionId].command?[ACTIONS[actionId].command]:[],action:ACTIONS[actionId].command||'Use the checkpoint button.',screen:'',result:'Verified by the simulation state.'}))};}
module.exports={withExpectedOutputs,canonicalCommand,ACTIONS,execute,initialState,validateDefinition,assertDefinition,definitionHash,newRuntime,advance,snapshot,signTest,verifyTest,accountDefinition};
