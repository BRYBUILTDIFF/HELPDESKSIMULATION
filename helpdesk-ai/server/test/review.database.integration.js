const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config();
process.env.NODE_ENV = "test";
const { PrismaClient } = require("@prisma/client");

test("review migration, shared limits, session isolation and command evidence against PostgreSQL", async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Integration verification requires a local database.");
  const schema = `review_${crypto.randomBytes(8).toString("hex")}`;
  assert.match(schema, /^review_[a-f0-9]{16}$/);
  const owner = new PrismaClient({ log: [] });
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  const res = () => ({ code: 200, headers: {}, set(k,v) { this.headers[k] = v; return this; }, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } });
  const fail = err => { if (err) throw err; };
  let original;
  try {
    await owner.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migrations = fs.readdirSync(path.join(__dirname, "../prisma/migrations")).filter(name => /^\d/.test(name)).sort();
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET search_path TO "${schema}"`);
      for (const name of migrations) {
        if (name === "20261109000100_review_improvements") {
          await tx.$executeRawUnsafe(`INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "updatedAt") VALUES (10, 'legacy@example.invalid', 'unused', 'Legacy', 'Test', CURRENT_TIMESTAMP)`);
          await tx.$executeRawUnsafe(`INSERT INTO "UserSessionState" ("userId", "sessions", "updatedAt") VALUES (10, '[{"id":"legacy-session","messages":[]}]', CURRENT_TIMESTAMP)`);
        }
        const sql = fs.readFileSync(path.join(__dirname, "../prisma/migrations", name, "migration.sql"), "utf8");
        for (const statement of sql.replace(/^--.*$/gm, "").split(";").map(value => value.trim()).filter(value => value && !["BEGIN", "COMMIT"].includes(value))) await tx.$executeRawUnsafe(statement);
      }
    }, { timeout: 30000 });
    assert.equal(await db.chatSession.count({ where: { userId: 10 } }), 1, "Legacy session must migrate");
    const fixture = await db.user.create({ data: { email: "fixture@example.invalid", passwordHash: "unused", firstName: "Fixture", lastName: "Test" } });
    const prismaPath = require.resolve("../src/prisma");
    require(prismaPath); original = require.cache[prismaPath].exports; require.cache[prismaPath].exports = db;
    const { requestLimit } = require("../src/middleware/requestLimits");
    const limiterA = requestLimit("integration", { max: 2, windowMs: 60000, key: req => req.user.id });
    const limiterB = requestLimit("integration", { max: 2, windowMs: 60000, key: req => req.user.id });
    let accepted = 0;
    const first = res(), second = res(), third = res();
    await limiterA({ user: fixture }, first, () => accepted++);
    await limiterB({ user: fixture }, second, () => accepted++);
    await limiterA({ user: fixture }, third, () => accepted++);
    assert.equal(accepted, 2); assert.equal(third.code, 429);
    const express = require("express");
    const app = express(); app.use(express.json({ limit: "256kb" }));
    const adminRoutes = require("../src/routes/admin.routes");
    app.use("/api/admin", adminRoutes);
    app.post("/body-test", (_req, response) => response.json({ ok: true }));
    app.use(require("../src/middleware/errorHandler"));
    const listener = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    try {
      const base = `http://127.0.0.1:${listener.address().port}`;
      const token = require("../src/utils/jwt").generateAccessToken(fixture);
      const routes = adminRoutes.stack.filter(layer => layer.route).map(layer => layer.route);
      for (const route of routes) for (const method of Object.keys(route.methods)) {
        const url = route.path.replace(/:[A-Za-z]+/g, "1");
        const response = await fetch(`${base}/api/admin${url}`, { method: method.toUpperCase(), headers: { Authorization: `Bearer ${token}` } });
        assert.equal(response.status, 403, `${method} ${route.path} must reject a non-admin`);
        await response.text();
      }
      const tooLarge = await fetch(`${base}/body-test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(300 * 1024) }) });
      assert.equal(tooLarge.status, 413); await tooLarge.text();
      const malformed = await fetch(`${base}/body-test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
      assert.equal(malformed.status, 400); await malformed.text();
    } finally { await new Promise(resolve => listener.close(resolve)); }
    const sessions = require("../src/controllers/sessionController");
    await sessions.saveSession({ user: fixture, params: { id: "owned" }, body: { session: { id: "owned", messages: [{ text: "password=private-secret" }] } } }, res(), fail);
    const other = res(); await sessions.getMySessions({ user: { id: 10 } }, other, fail);
    assert.equal(other.body.sessions.length, 1); assert.equal(other.body.sessions[0].id, "legacy-session");
    const saved = await db.chatSession.findUnique({ where: { userId_id: { userId: fixture.id, id: "owned" } } });
    assert.ok(!JSON.stringify(saved.data).includes("private-secret"));
    const module = await db.simulationModule.create({ data: { id: "verified", title: "DNS", category: "Network", difficulty: "Easy", simulation: { surface: "windows-terminal", steps: [{ title: "Inspect DNS", type: "command", actionId: "network.inspect", expectedCommands: ["ipconfig /all"] }, { title: "Flush DNS", type: "command", actionId: "network.flush-dns", expectedCommands: ["ipconfig /flushdns"] }] } } });
    const attempts = require("../src/controllers/simulationAttemptController");
    const started = res(); await attempts.startAttempt({ user: fixture, params: { id: module.id } }, started, fail);
    const attemptKey = started.body.attemptKey;
    const completion = require("../src/store/simulationModuleStore").recordModuleCompletion;
    await assert.rejects(() => completion({ moduleId: module.id, userId: fixture.id, attemptKey, surface: "windows-terminal", stepsCompleted: 2 }), /Complete each command/);
    const params = { id: module.id, attemptId: attemptKey };
    const forged = res(); await attempts.submitCommand({ user: { id: 10 }, params, body: { step: 0, command: "ipconfig" } }, forged, fail);
    assert.equal(forged.code, 410);
    const skipped = res(); await attempts.submitCommand({ user: fixture, params, body: { step: 1, command: "ping localhost" } }, skipped, fail);
    assert.equal(skipped.body.accepted, false);
    for (const [step, command] of ["ipconfig /all", "ipconfig /flushdns"].entries()) {
      const response = res(); await attempts.submitCommand({ user: fixture, params, body: { step, command } }, response, fail); assert.equal(response.body.accepted, true);
    }
    await completion({ moduleId: module.id, userId: fixture.id, attemptKey, surface: "windows-terminal", stepsCompleted: 0 });
    const row = await db.simulationCompletion.findUnique({ where: { attemptKey } });
    assert.equal(row.stepsCompleted, 2); assert.equal(row.verification, "simulated-actions");
    await sessions.deleteMyData({ user: fixture }, res(), fail);
    assert.equal(await db.chatSession.count({ where: { userId: fixture.id } }), 0);
  } finally {
    if (original) require.cache[require.resolve("../src/prisma")].exports = original;
    await db.$disconnect();
    await owner.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await owner.$disconnect();
    if (original) await original.$disconnect();
  }
});
