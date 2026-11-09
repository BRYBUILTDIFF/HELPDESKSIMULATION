const { test } = require("node:test");
const assert = require("node:assert/strict");
let localCalls = 0, providerCalls = 0, invalid = false;
let classification = "in_scope";
globalThis.fetch = async () => { localCalls++; throw new Error("Local classifier offline"); };
require.cache[require.resolve("../src/utils/openai")] = { exports: {
  getAIProvider: () => "deepseek", getDefaultModel: () => "deepseek-chat",
  getOpenAIClient: () => ({ chat: { completions: { create: async (request, options) => {
    providerCalls++;
    assert.equal(request.model, "deepseek-chat"); assert.equal(options.maxRetries, 0);
    return { choices: [{ message: { content: invalid ? "not a classification" : JSON.stringify({ classification, confidence: 0.99, reason: "Semantic decision" }) } }] };
  } } } })
} };
require.cache[require.resolve("../src/store/policyConfigStore")] = { exports: { getPolicyRuntimeConfig: async () => ({
  messages: { outOfScopeMessage: "Please ask an IT support question." },
  greetingPatternRegex: [], inScopeKeywordRegex: [], outOfScopeKeywordRegex: [], inScopeIntentRegex: []
}) } };
require.cache[require.resolve("../src/policy/contentSafety")] = { exports: { evaluateContentSafety: async () => null } };
const { evaluatePromptPolicy, evaluateResponsePolicy } = require("../src/policy/promptPolicy");
test("valid IT tickets use configured DeepSeek when the separate classifier is offline", async () => {
  const result = await evaluatePromptPolicy("My printer is offline. How can I fix it?");
  assert.equal(result.code, "ALLOWED"); assert.equal(result.directReply, undefined);
  assert.equal(localCalls, 1); assert.equal(providerCalls, 1);
});
test("output checks use the same working fallback and avoid repeated failed local connections", async () => {
  assert.equal(await evaluateResponsePolicy("Open printer settings and clear the pending queue."), true);
  assert.equal(localCalls, 1); assert.equal(providerCalls, 2);
});
test("the provider fallback still rejects unrelated prompts with IT keywords", async () => {
  classification = "out_of_scope";
  try { assert.equal((await evaluatePromptPolicy("Write a sonnet about my VPN")).code, "OUT_OF_SCOPE_REDIRECT"); }
  finally { classification = "in_scope"; }
});
test("invalid fallback decisions produce an availability error without permitting the request", async () => {
  invalid = true;
  try {
    const result = await evaluatePromptPolicy("My printer is offline");
    assert.equal(result.allowed, false); assert.equal(result.httpStatus, 503);
  } finally { invalid = false; }
});
