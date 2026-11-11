const { test } = require("node:test");
const assert = require("node:assert/strict");
let config = { messages: { greetingReply: "Configured welcome", outOfScopeMessage: "Configured redirect" }, greetingPatterns: ["magandang umaga"], inScopeKeywords: Array.from({length: 30}, (_,i) => "it-term-" + i), outOfScopeKeywords: Array.from({length: 30}, (_,i) => "topic-" + i), inScopeIntentPatterns: ["repair my work application"] };
let decision = "in_scope", calls = [], unsafe = false;
globalThis.fetch = async (_url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify({classification:decision, confidence:0.99, reason:"context"}) } }) }; };
require.cache[require.resolve("../src/store/policyConfigStore")] = { exports: {getPolicyRuntimeConfig:async()=>config} };
require.cache[require.resolve("../src/utils/openai")] = { exports: {getOpenAIClient:()=>null,getDefaultModel:()=>"test",getAIProvider:()=>"test"} };
require.cache[require.resolve("../src/policy/contentSafety")] = { exports: {evaluateContentSafety:async()=>unsafe ? {code:"SAFETY_CONTENT",message:"Blocked"}:null} };
const {evaluatePromptPolicy}=require("../src/policy/promptPolicy");
test("all configured keywords and intent phrases reach the classifier",async()=>{
  await evaluatePromptPolicy("repair my work application");
  const system=calls.at(-1).messages[0].content;
  assert.ok(system.includes("it-term-29")); assert.ok(system.includes("topic-29")); assert.ok(system.includes("repair my work application"));
});
test("configured greetings are exact normalized matches and still pass safety",async()=>{
  const before=calls.length;
  const result=await evaluatePromptPolicy("  MAGANDANG   UMAGA!!!  ");
  assert.equal(result.directReply,"Configured welcome"); assert.equal(calls.length,before);
  await evaluatePromptPolicy("magandang umaga, my VPN is broken"); assert.equal(calls.length,before+1);
  unsafe=true;
  try { assert.equal((await evaluatePromptPolicy("magandang umaga")).code,"SAFETY_CONTENT"); } finally {unsafe=false;}
});
test("changed settings apply to subsequent requests without a code change",async()=>{
  config={...config,greetingPatterns:["greetings team"],messages:{...config.messages,greetingReply:"New reply"},inScopeIntentPatterns:["restore workspace"]};
  assert.equal((await evaluatePromptPolicy("greetings team")).directReply,"New reply");
  await evaluatePromptPolicy("restore workspace"); assert.ok(calls.at(-1).messages[0].content.includes("restore workspace"));
});
test("reference terms cannot bypass a negative contextual decision",async()=>{
  decision="out_of_scope";
  try { assert.equal((await evaluatePromptPolicy("it-term-29 write my unrelated essay")).directReply,"Configured redirect"); } finally {decision="in_scope";}
});
