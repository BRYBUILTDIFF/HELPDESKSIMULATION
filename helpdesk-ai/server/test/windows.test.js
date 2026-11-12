const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
process.env.AWS_REGION = "test-region";
process.env.AWS_SIMULATION_LAUNCH_TEMPLATE_ID = "lt-test";
let calls, sessions, send, expiredQuery;
class Command { constructor(input) { this.input = input; } }
class DescribeInstancesCommand extends Command {}
class DescribeInstanceStatusCommand extends Command {}
class TerminateInstancesCommand extends Command {}
class RunInstancesCommand extends Command {}
require.cache[require.resolve("@aws-sdk/client-ec2")] = { exports: {
  DescribeInstancesCommand, DescribeInstanceStatusCommand, TerminateInstancesCommand, RunInstancesCommand,
  EC2Client: class { async send(command) { calls.push(command); return send(command); } }
} };
let queue = Promise.resolve();
const prisma = {
  $executeRaw: async () => {},
  $transaction: async (fn) => {
    const previous = queue;
    let release;
    queue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await fn(prisma); } finally { release(); }
  },
  simulationSession: {
    findMany: async (query) => { expiredQuery = query; return sessions.filter(s => s.status === "TERMINATING" || s.expiresAt < new Date()); },
    findUnique: async ({ where }) => sessions.find(s => s.id === where.id) || null,
    findFirst: async ({ where }) => sessions.find(s =>
      (!where.id || s.id === where.id) && s.userId === where.userId &&
      (!where.createdAt || (s.createdAt && s.createdAt > (where.createdAt.gt || where.createdAt.gte))) &&
      (!where.moduleId || s.moduleId === where.moduleId) &&
      (!where.status || where.status.in.includes(s.status)) &&
      (!where.expiresAt || s.expiresAt > where.expiresAt.gt)
    ) || null,
    count: async ({ where }) => sessions.filter(s => (!where.status || where.status.in.includes(s.status)) && (!where.userId || s.userId === where.userId) && (!where.createdAt || s.createdAt >= where.createdAt.gte)).length,
    create: async ({ data }) => { const row = { ...data, id: `session-${sessions.length}`, status: "PROVISIONING", createdAt: new Date() }; sessions.push(row); return row; },
    update: async ({ where, data }) => { const row = sessions.find(s => s.id === where.id); Object.assign(row, data); return { ...row }; }
  }
};
require.cache[require.resolve("../src/prisma")] = { exports: prisma };
require.cache[require.resolve("../src/store/simulationModuleStore")] = { exports: { getModuleById: async () => ({ id: "lab", enabled: true, simulation: { surface: "windows-os" } }) } };
const service = require("../src/services/windowsSimulationService");
const controller = require("../src/controllers/simulationSessionController");
test("a cancelled lab cannot launch a new instance", async () => {
  const row = {id:"cancelled-before-launch",userId:1,moduleId:"lab",status:"ENDED",expiresAt:new Date(Date.now()+60000)};
  sessions.push(row);
  await assert.rejects(service.createWindowsSimulationSession(row), error => error.status === 409);
  assert.ok(!calls.some(command => command instanceof RunInstancesCommand));
});
test("cancellation racing AWS launch immediately terminates the late instance", async () => {
  const row = {id:"cancelled-during-launch",userId:1,moduleId:"lab",status:"PROVISIONING",expiresAt:new Date(Date.now()+60000)};
  sessions.push(row);
  send = async command => {
    if (command instanceof RunInstancesCommand) { row.status="ENDED"; return {Instances:[{InstanceId:"i-late"}]}; }
    if (command instanceof DescribeInstancesCommand) return {Reservations:[{Instances:[{InstanceId:"i-late",State:{Name:"running"},Tags:[{Key:"SessionId",Value:row.id}]}]}]};
    return {};
  };
  await assert.rejects(service.createWindowsSimulationSession(row), error => error.status === 409);
  assert.ok(calls.some(command => command instanceof TerminateInstancesCommand));
  assert.equal(row.status,"ENDED");
});
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function fail(err) { if (err) throw err; }
beforeEach(() => { sessions = []; calls = []; expiredQuery = null; send = async () => ({}); });

test("new labs reserve eight boot minutes in addition to the usable session duration", async () => {
  const started = Date.now();
  send = async () => ({ Instances: [{ InstanceId: "i-new" }] });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 202);
  const expected = (8 + (Number(process.env.SIMULATION_TTL_MINUTES) || 20)) * 60000;
  assert.ok(sessions[0].expiresAt.getTime() >= started + expected);
  assert.ok(sessions[0].expiresAt.getTime() <= Date.now() + expected);
});

test("resuming a lab preserves its reveal time and original expiry", async () => {
  const createdAt = new Date(Date.now() - 10 * 60000);
  const expiresAt = new Date(createdAt.getTime() + 28 * 60000);
  sessions.push({ id: "resume", moduleId: "lab", userId: 1, status: "ACTIVE", ec2InstanceId: "i-resume", createdAt, expiresAt });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(new Date(res.body.revealAt).getTime(), createdAt.getTime() + 8 * 60000);
  assert.equal(res.body.expiresAt.getTime(), expiresAt.getTime());
  assert.equal(calls.length, 0);
});

test("returning to an unexpired lab resumes its existing VM without another launch", async () => {
  sessions.push({ id: "retained", moduleId: "lab", userId: 1, status: "ACTIVE", ec2InstanceId: "i-retained", expiresAt: new Date(Date.now() + 60000) });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, "retained");
  assert.equal(res.body.resumed, true);
  assert.equal(calls.length, 0);
  assert.equal(sessions.length, 1);
});

test("ending a retained lab terminates only its own instance", async () => {
  sessions.push({ id: "retained", userId: 1, status: "ACTIVE", ec2InstanceId: "i-retained" });
  send = async command => command instanceof DescribeInstancesCommand
    ? { Reservations: [{ Instances: [{ State: { Name: "running" }, Tags: [{ Key: "SessionId", Value: "retained" }] }] }] } : {};
  const res = response();
  await controller.endSimulationSession({ params: { id: "retained" }, user: { id: 1 } }, res, fail);
  assert.equal(res.body.status, "ENDED");
  assert.deepEqual(calls.find(c => c instanceof TerminateInstancesCommand).input.InstanceIds, ["i-retained"]);
});

test("a running VM stays provisioning until both EC2 health checks pass", async () => {
  const session = { id: "booting", ec2InstanceId: "i-booting", status: "PROVISIONING" };
  sessions.push(session);
  let healthy = false;
  send = async command => command instanceof DescribeInstanceStatusCommand
    ? { InstanceStatuses: [{ InstanceId: "i-booting", SystemStatus: { Status: "ok" }, InstanceStatus: { Status: healthy ? "ok" : "initializing" } }] }
    : { Reservations: [{ Instances: [{ State: { Name: "running" }, PrivateIpAddress: "10.0.0.5", Tags: [{ Key: "SessionId", Value: "booting" }] }] }] };
  assert.equal((await service.refreshWindowsSimulationSession(session)).status, "PROVISIONING");
  healthy = true;
  assert.equal((await service.refreshWindowsSimulationSession(session)).status, "READY");
  assert.equal(session.privateIp, "10.0.0.5");
});

test("missing EC2 health results cannot mark a workspace ready", async () => {
  const session = { id: "booting", ec2InstanceId: "i-booting", status: "PROVISIONING" };
  sessions.push(session);
  send = async command => command instanceof DescribeInstanceStatusCommand ? {}
    : { Reservations: [{ Instances: [{ State: { Name: "running" }, PrivateIpAddress: "10.0.0.5", Tags: [{ Key: "SessionId", Value: "booting" }] }] }] };
  assert.equal((await service.refreshWindowsSimulationSession(session)).status, "PROVISIONING");
});

test("existing deployments can still connect without the additional health-check permission", async () => {
  const session = { id: "booting", ec2InstanceId: "i-booting", status: "PROVISIONING" };
  sessions.push(session);
  send = async command => {
    if (command instanceof DescribeInstanceStatusCommand) {
      const error = new Error("Not authorized"); error.name = "UnauthorizedOperation"; throw error;
    }
    return { Reservations: [{ Instances: [{ State: { Name: "running" }, PrivateIpAddress: "10.0.0.5", Tags: [{ Key: "SessionId", Value: "booting" }] }] }] };
  };
  assert.equal((await service.refreshWindowsSimulationSession(session)).status, "READY");
});

test("failed termination is retried by scheduled cleanup", async () => {
  const session = { id: "retry", userId: 1, ec2InstanceId: "i-retry", status: "ACTIVE", expiresAt: new Date(0) };
  sessions.push(session);
  send = async () => { throw new Error("temporary AWS failure"); };
  await assert.rejects(service.terminateWindowsSimulationSession(session));
  assert.equal(session.status, "TERMINATING");
  send = async (command) => command instanceof DescribeInstancesCommand && command.input.InstanceIds
    ? { Reservations: [{ Instances: [{ InstanceId: "i-retry", State: { Name: "running" }, Tags: [{ Key: "SessionId", Value: "retry" }] }] }] }
    : {};
  await service.cleanupExpiredWindowsSimulationSessions();
  assert.equal(expiredQuery.where.OR[1].status, "TERMINATING");
  assert.equal(session.status, "ENDED");
  assert.ok(calls.some(call => call instanceof TerminateInstancesCommand));
});
test("AWS reconciliation terminates expired orphan instances", async () => {
  send = async (command) => command instanceof DescribeInstancesCommand ? { Reservations: [{ Instances: [{
    InstanceId: "i-orphan", Tags: [{ Key: "SessionId", Value: "missing" }, { Key: "AutoTerminateAt", Value: new Date(0).toISOString() }]
  }] }] } : {};
  await service.reconcileWindowsSimulationInstances();
  assert.deepEqual(calls.find(c => c instanceof TerminateInstancesCommand).input.InstanceIds, ["i-orphan"]);
});
test("ownership tag mismatch cannot terminate another instance", async () => {
  sessions.push({ id: "owned", status: "ACTIVE", ec2InstanceId: "i-other" });
  send = async () => ({ Reservations: [{ Instances: [{ State: { Name: "running" }, Tags: [{ Key: "SessionId", Value: "other" }] }] }] });
  await assert.rejects(service.terminateWindowsSimulationSession(sessions[0]));
  assert.ok(!calls.some(c => c instanceof TerminateInstancesCommand));
});
test("simultaneous launches cannot exceed the global capacity", async () => {
  send = async () => ({ Instances: [{ InstanceId: "i-new" }] });
  const a = response(), b = response();
  await Promise.all([
    controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, a, fail),
    controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 2 } }, b, fail)
  ]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [202, 429]);
  assert.equal(calls.filter(c => c instanceof RunInstancesCommand).length, 1);
});
test("cross-user workspace access returns 404", async () => {
  sessions.push({ id: "private", userId: 1, status: "ACTIVE" });
  const res = response();
  await controller.getSimulationSession({ params: { id: "private" }, user: { id: 2 } }, res, fail);
  assert.equal(res.statusCode, 404);
});

test("connect rejects a saved active session whose instance has terminated", async () => {
  sessions.push({ id: "stale", userId: 1, status: "ACTIVE", ec2InstanceId: "i-stale", privateIp: "10.0.0.5", expiresAt: new Date(Date.now() + 60000) });
  send = async () => ({ Reservations: [{ Instances: [{ State: { Name: "terminated" }, Tags: [{ Key: "SessionId", Value: "stale" }] }] }] });
  const res = response();
  await controller.connectSimulationSession({ params: { id: "stale" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 409);
  assert.equal(sessions[0].status, "ENDED");
  assert.equal(res.body.guacamoleUrl, undefined);
});

test("connect does not issue a stale URL when AWS verification fails", async () => {
  sessions.push({ id: "unverified", userId: 1, status: "ACTIVE", ec2InstanceId: "i-unverified", privateIp: "10.0.0.5", expiresAt: new Date(Date.now() + 60000) });
  send = async () => { throw new Error("AWS unavailable"); };
  const res = response();
  await controller.connectSimulationSession({ params: { id: "unverified" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.guacamoleUrl, undefined);
  assert.equal(sessions[0].status, "ACTIVE");
});
test("an instance already removed from AWS does not block account cleanup", async () => {
  const session = { id: "old", status: "ENDED", ec2InstanceId: "i-gone" };
  sessions.push(session);
  send = async () => { const err = new Error("No longer exists"); err.name = "InvalidInstanceID.NotFound"; throw err; };
  const ended = await service.terminateWindowsSimulationSession(session);
  assert.equal(ended.status, "ENDED");
});

test("an AWS instance still shutting down blocks a replacement launch", async () => {
  send = async () => ({ Reservations: [{ Instances: [{ InstanceId: "i-ending", State: { Name: "shutting-down" } }] }] });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 429);
  assert.equal(sessions.length, 0);
  assert.ok(!calls.some(c => c instanceof RunInstancesCommand));
});

test("an ambiguous launch failure keeps its capacity reservation", async () => {
  sessions.push({ id: "uncertain", status: "PROVISIONING", userId: 1, expiresAt: new Date(Date.now() + 60000) });
  send = async () => { throw new Error("Connection lost after launch request"); };
  await assert.rejects(service.createWindowsSimulationSession(sessions[0]));
  assert.equal(sessions[0].status, "PROVISIONING");
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 2 } }, res, fail);
  assert.equal(res.statusCode, 429);
  assert.equal(calls.filter(c => c instanceof RunInstancesCommand).length, 1);
});

test("an explicitly denied launch releases the reservation and explains the AWS restriction", async () => {
  const session = { id: "denied", moduleId: "lab", userId: 1, status: "PROVISIONING", expiresAt: new Date(Date.now() + 60000) };
  sessions.push(session);
  send = async () => { const error = new Error("Explicit deny"); error.name = "UnauthorizedOperation"; throw error; };
  await assert.rejects(service.createWindowsSimulationSession(session), /AWS denied permission/);
  assert.equal(session.status, "FAILED");
  assert.ok(session.endedAt instanceof Date);
});

test("retrying provisioning without an instance uses the original launch token", async () => {
  sessions.push({ id: "interrupted", moduleId: "lab", userId: 1, status: "PROVISIONING", expiresAt: new Date(Date.now() + 60000) });
  send = async () => ({ Instances: [{ InstanceId: "i-recovered" }] });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 202);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].ec2InstanceId, "i-recovered");
  assert.equal(calls.find(c => c instanceof RunInstancesCommand).input.ClientToken, "interrupted");
});

test("daily lab quota blocks a new launch without affecting another account", async () => {
  for (let i = 0; i < 3; i++) sessions.push({ id: `old-${i}`, userId: 1, status: "ENDED", createdAt: new Date() });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 429); assert.equal(calls.length, 0);
});
test("lab cooldown prevents immediate end and recreate loops", async () => {
  sessions.push({ id: "recent", userId: 1, status: "ENDED", createdAt: new Date() });
  const res = response();
  await controller.createSimulationSession({ body: { moduleId: "lab" }, user: { id: 1 } }, res, fail);
  assert.equal(res.statusCode, 429); assert.equal(calls.length, 0);
});
