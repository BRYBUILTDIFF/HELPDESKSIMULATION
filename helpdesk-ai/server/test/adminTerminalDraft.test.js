const {test}=require('node:test');const assert=require('node:assert/strict');const runtime=require('../src/services/terminalRuntime');
let captured,offline=false;
require.cache[require.resolve('../src/utils/openai')]={exports:{getAIProvider:()=> 'test',getDefaultModel:()=> 'test-model',getOpenAIClient:()=>offline?null:{chat:{completions:{create:async options=>{captured=options;return {choices:[{message:{content:JSON.stringify({title:'Account recovery',category:'Account',difficulty:'Easy',simulation:runtime.accountDefinition()})}}]};}}}}}};
const controller=require('../src/controllers/adminController');
const invoke=async()=>{let payload;const response={status(){return this;},json(data){payload=data;return this;}};await controller.generateSimulationModuleDraft({body:{mode:'from_prompt',sourcePrompt:'Windows Terminal unlock locked domain account using PowerShell'}},response,error=>{throw error;});return payload;};
test('AI generation includes executable action contract and preserves assessments in its draft',async()=>{
 const result=await invoke();assert.ok(captured.messages[0].content.includes('expectedCommands'));assert.ok(captured.messages[0].content.includes('account.unlock'));assert.equal(result.draft.simulation.steps[0].type,'checkpoint');assert.equal(result.draft.simulation.steps[2].actionId,'account.unlock');assert.deepEqual(result.draft.simulation.steps[2].expectedCommands,['Unlock-ADAccount -Identity jdoe']);assert.deepEqual(runtime.validateDefinition(result.draft.simulation),[]);assert.equal(result.draft.generationSource,'ai');
});
test('unavailable AI is identified as a template, with a valid account recovery fallback',async()=>{
 offline=true;try{const result=await invoke();assert.equal(result.draft.generationSource,'template');assert.match(result.generationNotice,/unavailable/);assert.deepEqual(runtime.validateDefinition(result.draft.simulation),[]);}finally{offline=false;}
});
