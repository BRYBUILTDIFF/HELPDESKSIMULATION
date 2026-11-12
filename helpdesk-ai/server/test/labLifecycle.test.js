const { test } = require("node:test");
const assert = require("node:assert/strict");
let query, fail = false, ended = [];
require.cache[require.resolve("../src/prisma")] = {exports:{simulationSession:{findMany:async args=>{query=args;return [{id:"owned",userId:1}];}}}};
require.cache[require.resolve("../src/services/windowsSimulationService")] = {exports:{terminateWindowsSimulationSession:async row=>{ended.push(row.id);if(fail)throw Error("AWS unavailable");}}};
const {endUserLabs}=require("../src/services/labLifecycleService");
test("lab cleanup always scopes caller-supplied IDs to the authenticated owner",async()=>{
  await endUserLabs(1,"requested-id");
  assert.equal(query.where.userId,1);assert.equal(query.where.id,"requested-id");assert.deepEqual(ended,["owned"]);
});
test("cleanup failure blocks deletion and remains retryable",async()=>{
  fail=true;try{await assert.rejects(endUserLabs(1),error=>error.status===503);}finally{fail=false;}
});
