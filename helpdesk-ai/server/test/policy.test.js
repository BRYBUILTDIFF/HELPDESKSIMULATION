const { test } = require("node:test");
const assert = require("node:assert/strict");
let classifierCalls = 0;
globalThis.fetch = async () => {
  classifierCalls += 1;
  return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify({ classification: "out_of_scope", confidence: 0.99, reason: "Outside IT" }) } }) };
};
require.cache[require.resolve("../src/store/policyConfigStore")] = { exports: { getPolicyRuntimeConfig: async () => ({
  messages: { outOfScopeMessage: "Please ask an IT support question." },
  greetingPatternRegex: [], inScopeKeywordRegex: [/\bvpn\b/i], inScopeIntentRegex: [], outOfScopeKeywordRegex: [/\bessay\b/i]
}) } };
require.cache[require.resolve("../src/policy/contentSafety")] = { exports: { evaluateContentSafety: async () => null } };
const { evaluatePromptPolicy } = require("../src/policy/promptPolicy");
test("established IT conversations still classify unfamiliar short requests", async () => {
  const result = await evaluatePromptPolicy("Compose a sonnet about tulips", [], { conversationScope: "it_support" });
  assert.equal(classifierCalls, 1);
  assert.equal(result.code, "OUT_OF_SCOPE_REDIRECT");
});
test("explicit out-of-scope terms redirect even with IT context", async () => {
  const result = await evaluatePromptPolicy("write an essay", [], { conversationScope: "it_support" });
  assert.equal(result.code, "OUT_OF_SCOPE_REDIRECT");
});
test("ordinary IT requests retain their existing rule path", async () => {
  const result = await evaluatePromptPolicy("Help reset my VPN", []);
  assert.equal(result.code, "ALLOWED_RULE_MATCH");
});
