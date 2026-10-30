const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
require("dotenv").config();
process.env.NODE_ENV = "test";
const prisma = require("../src/prisma");
const { hashPassword } = require("../src/utils/password");

// Opt-in local database check. All fixture writes are rolled back, even on failure.
test("PostgreSQL supports rotated authentication and server-owned chat history", async () => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "This test is limited to a local database.");
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  let completed = false;
  try {
    await prisma.$transaction(async (tx) => {
      const wrapped = new Proxy(tx, { get(target, key) { return key === "$transaction" ? (fn) => fn(wrapped) : target[key]; } });
      require.cache[require.resolve("../src/prisma")].exports = wrapped;
      const { login, refresh } = require("../src/controllers/authController");
      const { getChatHistory, appendChatTurn } = require("../src/store/chatHistoryStore");
      const email = `security-test-${crypto.randomUUID()}@example.invalid`;
      const user = await tx.user.create({ data: { email, firstName: "Security", lastName: "Test", passwordHash: await hashPassword("Regression@123"), mustChangePassword: true } });
      const response = () => ({ cookies: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; }, cookie(name, value) { this.cookies[name] = value; }, clearCookie() {} });
      const fail = err => { if (err) throw err; };
      const signedIn = response();
      await login({ body: { email, password: "Regression@123" } }, signedIn, fail);
      assert.equal(signedIn.body.user.mustChangePassword, true);
      const rotated = response();
      await refresh({ cookies: signedIn.cookies }, rotated, fail);
      assert.equal(rotated.statusCode, 200);
      assert.equal(await tx.refreshToken.count({ where: { userId: user.id } }), 1);
      await appendChatTurn(user.id, "integration-session", "VPN unavailable", "Check the connection");
      assert.equal((await getChatHistory(user.id, "integration-session")).length, 2);
      assert.deepEqual(await getChatHistory(user.id + 1000000, "integration-session"), []);
      completed = true;
      throw rollback;
    }, { timeout: 15000 });
  } catch (err) {
    if (err !== rollback) throw err;
  } finally {
    require.cache[require.resolve("../src/prisma")].exports = prisma;
    await prisma.$disconnect();
  }
  assert.equal(completed, true);
});
