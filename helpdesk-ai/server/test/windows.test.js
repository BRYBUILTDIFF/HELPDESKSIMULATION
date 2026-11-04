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
    findFirst: async ({ where }) => sessions.find(s => s.id === where.id && s.userId === where.userId) || null,
    count: async ({ where }) => sessions.filter(s => where.status.in.includes(s.status) && (!where.userId || s.userId === where.userId)).length,
    create: async ({ data }) => { const row = { ...data, id: `session-${sessions.length}`, status: "PROVISIONING" }; sessions.push(row); return row; },
    update: async ({ where, data }) => { const row = sessions.find(s => s.id === where.id); Object.assign(row, data); return { ...row }; }
  }
};
require.cache[require.resolve("../src/prisma")] = { exports: prisma };
require.cache[require.resolve("../src/store/simulationModuleStore")] = { exports: { getModuleById: async () => ({ id: "lab", enabled: true, simulation: { surface: "windows-os" } }) } };
const service = require("../src/services/windowsSimulationService");
const controller = require("../src/controllers/simulationSessionController");
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function fail(err) { if (err) throw err; }
beforeEach(() => { sessions = []; calls = []; expiredQuery = null; send = async () => ({}); });

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
