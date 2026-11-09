const { test } = require("node:test");
const assert = require("node:assert/strict");
let confidence;
let providerCalls = 0;
globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify({ classification: "in_scope", confidence, reason: "Printer ticket" }) } }) });
require.cache[require.resolve("../src/utils/openai")] = { exports: {
  getAIProvider: () => "deepseek", getDefaultModel: () => "deepseek-chat",
  getOpenAIClient: () => ({ chat: { completions: { create: async () => {
    providerCalls++;
    return { choices: [{ message: { content: JSON.stringify({ classification: "in_scope", confidence: 0.99, reason: "Printer support" }) } }] };
  } } } })
} };
require.cache[require.resolve("../src/store/policyConfigStore")] = { exports: { getPolicyRuntimeConfig: async () => ({ messages: {}, greetingPatternRegex: [] }) } };
require.cache[require.resolve("../src/policy/contentSafety")] = { exports: { evaluateContentSafety: async () => null } };
const policyPath = require.resolve("../src/policy/promptPolicy");
for (const value of [undefined, null, 0.4]) {
  test(`local confidence ${String(value)} is verified before asking a valid IT ticket to clarify`, async () => {
    confidence = value;
    delete require.cache[policyPath];
    const { evaluatePromptPolicy } = require(policyPath);
    const before = providerCalls;
    const result = await evaluatePromptPolicy("My printer is offline. How do I fix it?");
    assert.equal(result.code, "ALLOWED");
    assert.equal(result.directReply, undefined);
    assert.equal(providerCalls, before + 1);
  });
}
