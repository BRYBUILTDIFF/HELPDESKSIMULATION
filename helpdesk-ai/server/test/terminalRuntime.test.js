const {test}=require('node:test');const assert=require('node:assert/strict');
const r=require('../src/services/terminalRuntime');
const definition=()=>r.accountDefinition();
test('catalog account recovery performs real simulated state transitions with distinct checkpoints',()=>{
 let runtime=r.newRuntime(definition()),next=0;const outputs=[];
 for(const step of runtime.definition.steps){const changed=r.advance(runtime,next,{step:next,kind:step.type,command:step.expectedCommands[0]});assert.equal(changed.accepted,true);runtime=changed.runtime;next=changed.nextStep;outputs.push(changed.output);}
 assert.equal(next,6);assert.equal(runtime.state.locked,false);assert.equal(runtime.state.passwordReset,true);
 assert.match(outputs[1],/LockedOut: true/);assert.match(outputs[4],/LockedOut: false/);assert.match(outputs[5],/login succeeded/);
});
test('malformed, mismatched, unsupported, prose and placeholder commands cannot publish',()=>{
 for(const mutate of [d=>d.steps[1].expectedCommands=['net user [username] /domain and press enter'],d=>d.steps[1].actionId='arbitrary.shell',d=>d.steps[0].type='command',d=>d.surface='mac-terminal',d=>d.steps[0].expectedCommands=['help'],d=>d.steps.splice(0,1)]){const d=definition();mutate(d);assert.ok(r.validateDefinition(d).length);assert.throws(()=>r.newRuntime(d));}
});
test('wrong order and wrong commands leave state unchanged and produce auditable events',()=>{
 const runtime=r.newRuntime(definition());const wrong=r.advance(runtime,0,{kind:'command',command:'help me',step:2});assert.equal(wrong.accepted,false);assert.deepEqual(wrong.runtime.state,runtime.state);assert.equal(wrong.runtime.events.length,1);
 const checkpoint=r.advance(runtime,0,{kind:'command',command:'help',step:0});assert.equal(checkpoint.accepted,false);assert.equal(checkpoint.utility,true);assert.equal(checkpoint.nextStep,0);
});
test('login and verification cannot succeed before recovery',()=>{
 assert.equal(r.execute('account.test-login',{...r.initialState(),elevated:true}).ok,false);
 assert.equal(r.execute('account.verify',{...r.initialState(),elevated:true}).ok,false);
});
test('admin test receipts bind actor, exact definition, and reject tampering',()=>{
 const before=process.env.JWT_ACCESS_SECRET;process.env.JWT_ACCESS_SECRET='test-only-secret';
 try{const d=definition(),token=r.signTest(d,7);assert.equal(r.verifyTest(token,d,7),true);assert.equal(r.verifyTest(token,d,8),false);const changed=definition();changed.steps[0].title+=' changed';assert.equal(r.verifyTest(token,changed,7),false);assert.equal(r.verifyTest(token+'tampered',d,7),false);}finally{if(before===undefined)delete process.env.JWT_ACCESS_SECRET;else process.env.JWT_ACCESS_SECRET=before;}
});
test('DNS training output follows deterministic repair state',()=>{
 const d={surface:'windows-terminal',steps:['network.inspect','network.flush-dns','network.test'].map(actionId=>({title:actionId,actionId,type:'command',expectedCommands:[r.ACTIONS[actionId].command]}))};let current=r.newRuntime(d),next=0;
 for(const step of d.steps){const result=r.advance(current,next,{step:next,kind:'command',command:step.expectedCommands[0]});assert.ok(result.accepted);current=result.runtime;next=result.nextStep;}assert.equal(current.state.dnsBroken,false);
});

test('command normalization preserves quoted training password case',()=>{assert.notEqual(r.canonicalCommand(r.ACTIONS['account.reset-password'].command),r.canonicalCommand(r.ACTIONS['account.reset-password'].command.replace('Training-Only','training-only')));assert.equal(r.canonicalCommand('  WHOAMI  '),'whoami');});

test('expected output is generated from ordered state and contradictory output is rejected',()=>{const d=r.withExpectedOutputs(r.accountDefinition());assert.match(d.steps[1].expectedOutput,/LockedOut: true/);assert.match(d.steps[4].expectedOutput,/LockedOut: false/);assert.deepEqual(r.validateDefinition(d),[]);d.steps[1].expectedOutput='LockedOut: false';assert.ok(r.validateDefinition(d).some(error=>error.includes('Expected output does not match')));});
