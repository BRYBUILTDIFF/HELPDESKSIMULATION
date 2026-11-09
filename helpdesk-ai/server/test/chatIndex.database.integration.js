const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
test("chat index repair restores upserts and refuses duplicate data without deleting it", async () => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname));
  const db = new PrismaClient({ log: [] });
  const schema = `index_review_${crypto.randomBytes(8).toString("hex")}`;
  const sql = fs.readFileSync(path.join(__dirname, "../../infrastructure/database/repair-chat-unique-index.sql"), "utf8");
  const rollback = new Error("rollback fixtures");
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe('CREATE TABLE "PolicyConversation" ("userId" INT, "sessionId" TEXT, "scope" TEXT)');
      await tx.$executeRawUnsafe(`INSERT INTO "PolicyConversation" VALUES (1, 'session', 'old')`);
      await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(sql);
      await tx.$executeRawUnsafe(`INSERT INTO "PolicyConversation" VALUES (1, 'session', 'updated') ON CONFLICT ("userId", "sessionId") DO UPDATE SET scope = EXCLUDED.scope`);
      const rows = await tx.$queryRawUnsafe('SELECT scope FROM "PolicyConversation"');
      assert.deepEqual(rows, [{ scope: "updated" }]);
      await tx.$executeRawUnsafe('DROP INDEX "PolicyConversation_userId_sessionId_repair_key"');
      await tx.$executeRawUnsafe(`INSERT INTO "PolicyConversation" VALUES (1, 'session', 'duplicate')`);
      await tx.$executeRawUnsafe('SAVEPOINT duplicate_check');
      await assert.rejects(() => tx.$executeRawUnsafe(sql));
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT duplicate_check');
      const counts = await tx.$queryRawUnsafe('SELECT count(*)::int AS total FROM "PolicyConversation"');
      assert.equal(counts[0].total, 2);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await db.$disconnect(); }
});
