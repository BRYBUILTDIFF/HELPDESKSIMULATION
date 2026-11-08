const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_ACCESS_SECRET = "access-secret-for-tests-only-123456789";
process.env.JWT_REFRESH_SECRET = "refresh-secret-for-tests-only-123456789";
const { generateAccessToken, generateRefreshToken } = require("../src/utils/jwt");
const { hashToken, plainDescription, validateSecurityConfig } = require("../src/utils/security");

let user, records, nextId;
const prisma = {
  user: { findUnique: async () => user },
  refreshToken: {
    findUnique: async ({ where }) => {
      const row = records.find(row => row.token === where.token);
      return row ? { ...row, user } : null;
    },
    create: async ({ data }) => { const row = { ...data, id: ++nextId }; records.push(row); return row; },
    deleteMany: async ({ where }) => {
      const before = records.length;
      records = records.filter(row => !(
        (where.id === undefined || row.id === where.id) &&
        (where.userId === undefined || row.userId === where.userId) &&
        (where.token === undefined || (typeof where.token === "string" ? row.token === where.token : row.token.startsWith(where.token.startsWith)))
      ));
      return { count: before - records.length };
    }
  },
  $executeRaw: async () => {},
  $transaction: async (fn) => fn(prisma)
};
require.cache[require.resolve("../src/prisma")] = { exports: prisma };
require.cache[require.resolve("../src/utils/password")] = { exports: { comparePassword: async (plain) => plain === "Valid@123", hashPassword: async () => "hash" } };
const auth = require("../src/controllers/authController");
const { verifyToken, requireAdmin } = require("../src/middleware/authMiddleware");
function response() {
  return { statusCode: 200, cookies: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, cookie(name, value) { this.cookies[name] = value; }, clearCookie(name) { delete this.cookies[name]; } };
}
const fail = (err) => { if (err) throw err; };
beforeEach(() => { user = { id: 1, email: "test@example.com", role: "USER", isActive: true, passwordHash: "hash" }; records = []; nextId = 0; });

test("JWT secrets must be distinct and sufficiently long", () => {
  assert.throws(() => validateSecurityConfig({}));
  assert.throws(() => validateSecurityConfig({ JWT_ACCESS_SECRET: "a".repeat(32), JWT_REFRESH_SECRET: "a".repeat(32) }));
  assert.doesNotThrow(() => validateSecurityConfig());
});
test("descriptions cannot preserve executable HTML", () => {
  assert.equal(plainDescription('<b>Check</b><br><img src=x onerror="alert(1)">'), "Check");
});
test("same-second logins issue unique hashed refresh credentials", async () => {
  const a = response(), b = response();
  await auth.login({ body: { email: user.email, password: "Valid@123" } }, a, fail);
  await auth.login({ body: { email: user.email, password: "Valid@123" } }, b, fail);
  assert.notEqual(a.cookies.refreshToken, b.cookies.refreshToken);
  assert.equal(records.length, 2);
  assert.ok(records.every(row => !row.token.includes("eyJ")));
  assert.ok(records[0].token.endsWith(hashToken(a.cookies.refreshToken)));
});
test("refresh rotates credentials, uses current role, and detects replay", async () => {
  const login = response();
  await auth.login({ body: { email: user.email, password: "Valid@123" } }, login, fail);
  const old = login.cookies.refreshToken;
  user.role = "ADMIN";
  const rotated = response();
  await auth.refresh({ cookies: { refreshToken: old } }, rotated, fail);
  assert.equal(rotated.statusCode, 200);
  assert.notEqual(rotated.cookies.refreshToken, old);
  assert.equal(jwt.verify(rotated.body.accessToken, process.env.JWT_ACCESS_SECRET).role, undefined);
  assert.equal(jwt.verify(rotated.body.accessToken, process.env.JWT_ACCESS_SECRET).tokenVersion, 0);
  assert.equal(records.length, 1);
  const replay = response();
  await auth.refresh({ cookies: { refreshToken: old } }, replay, fail);
  assert.equal(replay.statusCode, 401);
  assert.equal(records.length, 0);
});
test("inactive and unknown users receive the same login response", async () => {
  user.isActive = false;
  const inactive = response();
  await auth.login({ body: { email: "test@example.com", password: "Valid@123" } }, inactive, fail);
  user = null;
  const unknown = response();
  await auth.login({ body: { email: "unknown@example.com", password: "Valid@123" } }, unknown, fail);
  assert.deepEqual(inactive.body, unknown.body);
  assert.equal(inactive.statusCode, 401);
});
test("authorization uses database role and requires initial password change", async () => {
  const token = generateAccessToken({ id: 1, role: "ADMIN" });
  const req = { headers: { authorization: `Bearer ${token}` }, originalUrl: "/api/admin/users" };
  let called = false;
  await verifyToken(req, response(), () => { called = true; });
  assert.equal(called, true);
  const forbidden = response();
  requireAdmin(req, forbidden, fail);
  assert.equal(forbidden.statusCode, 403);
  user.mustChangePassword = true;
  const blocked = response();
  await verifyToken(req, blocked, fail);
  assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");
  req.originalUrl = "/api/auth/change-password";
  await verifyToken(req, response(), fail);
});
test("database outages propagate as server failures rather than invalid sessions", async () => {
  const original = prisma.user.findUnique;
  const outage = new Error("Database unavailable");
  prisma.user.findUnique = async () => { throw outage; };
  let received;
  try {
    await verifyToken({ headers: { authorization: `Bearer ${generateAccessToken({ id: 1 })}` } }, response(), err => { received = err; });
    assert.equal(received, outage);
  } finally { prisma.user.findUnique = original; }
});
test("public registration is not routed to account creation", async () => {
  const router = require("../src/routes/auth.routes");
  const res = response();
  await new Promise((resolve, reject) => {
    router.handle({ method: "POST", url: "/register", headers: {}, body: {} }, res, err => {
      if (err) return reject(err);
      res.status(404).json({ message: "Not found" });
      resolve();
    });
  });
  assert.equal(res.statusCode, 404);
  assert.equal(records.length, 0);
});

test("password version changes immediately revoke old access tokens", async () => {
  const token = generateAccessToken({ id: 1, tokenVersion: 0 });
  user.tokenVersion = 1;
  const res = response();
  await verifyToken({ headers: { authorization: `Bearer ${token}` }, originalUrl: "/api/auth/me" }, res, fail);
  assert.equal(res.statusCode, 401);
});
test("foreign issuer access tokens are rejected", async () => {
  const token = jwt.sign({ id: 1, tokenVersion: 0 }, process.env.JWT_ACCESS_SECRET, { issuer: "other", audience: "helpdesk-client" });
  const res = response();
  await verifyToken({ headers: { authorization: `Bearer ${token}` }, originalUrl: "/api/auth/me" }, res, fail);
  assert.equal(res.statusCode, 401);
});
test("refresh session cannot renew beyond its absolute lifetime", () => {
  assert.throws(() => generateRefreshToken({ id: 1, familyCreatedAt: Date.now() - 31 * 86400000 }));
});
