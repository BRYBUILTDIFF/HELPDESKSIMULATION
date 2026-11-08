const { test } = require("node:test");
const assert = require("node:assert/strict");
let classifierCalls = 0;
let classification = "out_of_scope";
let unavailable = false;
globalThis.fetch = async () => {
  classifierCalls += 1;
  if (unavailable) throw new Error("Unavailable test classifier");
  return { ok: true, text: async () => JSON.stringify({ message: { content: JSON.stringify({ classification, confidence: 0.99, reason: "Outside IT" }) } }) };
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
test("IT keywords cannot bypass classifier decisions", async () => {
  const before = classifierCalls;
  const result = await evaluatePromptPolicy("Compose a sonnet about my VPN", []);
  assert.equal(result.code, "OUT_OF_SCOPE_REDIRECT");
  assert.equal(classifierCalls, before + 1);
});

test("mixed keywords defer to context classification instead of hard rejection", async () => {
  classification = "in_scope";
  try {
    const result = await evaluatePromptPolicy("My VPN blocks uploading the essay file", []);
    assert.equal(result.code, "ALLOWED");
  } finally { classification = "out_of_scope"; }
});
test("classifier outages return a fixed clarification instead of generating an answer", async () => {
  unavailable = true;
  try {
    const result = await evaluatePromptPolicy("Help with VPN", []);
    assert.equal(result.code, "SCOPE_CLASSIFIER_UNAVAILABLE");
    assert.ok(result.directReply);
  } finally { unavailable = false; }
});
