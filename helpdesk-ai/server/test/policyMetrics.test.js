const { test } = require("node:test");
const assert = require("node:assert/strict");
const groups = [
  { code: "ALLOWED", blocked: false, _count: { _all: 10 } },
  { code: "OUT_OF_SCOPE_REDIRECT", blocked: false, _count: { _all: 3 } },
  { code: "OUTPUT_SCOPE_FILTERED", blocked: false, _count: { _all: 2 } },
  { code: "SAFETY_THREAT", blocked: true, _count: { _all: 3 } },
  { code: "SCOPE_CLASSIFIER_UNAVAILABLE", blocked: false, _count: { _all: 4 } },
  { code: "SAFETY_UNAVAILABLE", blocked: true, _count: { _all: 1 } }
];
let saved;
const queries = [];
require.cache[require.resolve("../src/prisma")] = { exports: {
  policyEvent: {
    create: async ({data}) => { saved = data; return data; },
    groupBy: query => { queries.push(query); return Promise.resolve(query.where ? groups.slice(3) : groups); },
    count: () => Promise.resolve(9), findMany: async () => groups
  },
  $transaction: operations => Promise.all(operations)
} };
const { policyOutcome, summarize, getPolicySummary, recordPolicyEvent, listPolicyEvents } = require("../src/store/policyEventStore");
test("legacy outcomes and block rate exclude unavailable checks", async () => {
  assert.equal(policyOutcome(groups[5]), "UNAVAILABLE");
  assert.equal(policyOutcome(groups[1]), "REDIRECTED");
  assert.equal(policyOutcome(groups[2]), "OUTPUT_FILTERED");
  const summary = summarize(groups);
  assert.equal(summary.total, 23);
  assert.equal(summary.allowed, 10);
  assert.equal(summary.evaluated, 18);
  assert.equal(summary.blockRate, 16.7);
  assert.equal(summarize([]).blockRate, 0);
  assert.equal(summarize(groups.slice(-1)).blockRate, 0);
  assert.equal((await listPolicyEvents())[1].outcome, "REDIRECTED");
});
test("today is aggregated independently at Philippine midnight", async () => {
  const summary = await getPolicySummary();
  assert.equal(summary.today.blocked, 3);
  assert.equal(summary.today.total, 8);
  assert.equal(summary.timezone, "Asia/Manila");
  assert.equal(queries[1].where.at.gte.getUTCHours(), 16);
});
test("new service outages are not stored as safety blocks", async () => {
  await recordPolicyEvent({message: "test", reason: "offline", code: "SAFETY_UNAVAILABLE", blocked: true});
  assert.equal(saved.blocked, false);
});
