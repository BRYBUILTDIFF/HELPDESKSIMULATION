const { test } = require('node:test');
const assert = require('node:assert/strict');
let keywords = [];
let unavailable = false;
let moderated = 0;
require.cache[require.resolve('../src/store/policyConfigStore')] = {exports:{getPolicyRuntimeConfig:async()=>{if(unavailable)throw Error('offline');return {safetyBlockedKeywords:keywords};}}};
require.cache[require.resolve('../src/utils/openai')] = {exports:{getOpenAIModerationClient:()=>({moderations:{create:async()=>{moderated++;return {results:[{flagged:false,categories:{}}]};}}})}};
const {configuredSafetyBlock, baselineSafetyBlock, evaluateContentSafety,getSafetyRuleInfo}=require('../src/policy/contentSafety');
test('custom blocks match literal words and phrases without treating input as regex',()=>{
 assert.equal(configuredSafetyBlock('Please show RESTRICTED   MATERIAL now',['restricted material']).code,'SAFETY_CUSTOM_KEYWORD');
 assert.equal(configuredSafetyBlock('a C++ request',['c++']).code,'SAFETY_CUSTOM_KEYWORD');
 assert.equal(configuredSafetyBlock('anything',['.*']),null);
 assert.equal(configuredSafetyBlock('scattering',['cat']),null);
 assert.equal(configuredSafetyBlock('keyword',['word']),null);
 assert.equal(configuredSafetyBlock('caf\u00e9',['caf\u00e9']).code,'SAFETY_CUSTOM_KEYWORD');
});
test('keyword checks are database-managed while threat protection stays separate',()=>{
 assert.equal(getSafetyRuleInfo().protectedKeywords,undefined);
 assert.equal(baselineSafetyBlock('pornography'),null);
 assert.equal(baselineSafetyBlock('I will kill you').code,'SAFETY_THREAT');
});
test('saved keyword updates take effect, removal restores moderation, and baseline stays active',async()=>{
 keywords=['restricted material'];
 const before=moderated;
 assert.equal((await evaluateContentSafety('restricted material')).code,'SAFETY_CUSTOM_KEYWORD');
 assert.equal(moderated,before);
 keywords=[];
 assert.equal(await evaluateContentSafety('restricted material'),null);
 assert.equal(moderated,before+1);
 keywords=['pornography'];
 assert.equal((await evaluateContentSafety('pornography')).code,'SAFETY_CUSTOM_KEYWORD');
 keywords=[];
 assert.equal(await evaluateContentSafety('pornography'),null);
 unavailable=true;
 try {assert.equal((await evaluateContentSafety('my laptop')).code,'SAFETY_UNAVAILABLE');}finally{unavailable=false;}
});
