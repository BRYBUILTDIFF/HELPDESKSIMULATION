const { test } = require("node:test");
const assert = require("node:assert/strict");
const { recordViolation, safetyViolation } = require("../src/services/sessionRestrictionService");
function database() {
  let row = null;
  return { $executeRaw: async () => {}, sessionRestriction: {
    findUnique: async () => row,
    upsert: async ({create, update}) => (row = row ? {...row, ...update} : create)
  } };
}
const event = {userId: 1, sessionId: "conversation", blocked: true, code: "SAFETY_THREAT"};
test("three safety violations trigger ten minutes, then reset", async () => {
  const tx = database(), now = new Date();
  assert.equal((await recordViolation(tx, event, now)).expiresAt, null);
  await recordViolation(tx, event, now);
  const third = await recordViolation(tx, event, now);
  assert.equal(third.violations, 3);
  assert.equal(third.expiresAt - now, 600000);
  assert.equal((await recordViolation(tx, event, new Date(+now + 1000))).violations, 3);
  const after = await recordViolation(tx, event, new Date(+now + 601000));
  assert.equal(after.violations, 1); assert.equal(after.expiresAt, null);
});
test("non-violations never contribute; windows expire after fifteen minutes", async () => {
  for (const code of ["SAFETY_UNAVAILABLE", "SCOPE_CLASSIFIER_UNAVAILABLE", "OUT_OF_SCOPE_REDIRECT", "OUTPUT_SAFETY_FILTERED", "SCOPE_CLARIFICATION"]) {
    assert.equal(safetyViolation({...event, code}), false);
  }
  const tx = database(), now = new Date();
  await recordViolation(tx, event, now);
  assert.equal((await recordViolation(tx, event, new Date(+now + 900001))).violations, 1);
});
