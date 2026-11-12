require("./owner-config");
const fs = require("fs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { spawn } = require("child_process");
const { backupKey, pgArgs, pgEnv } = require("./secure-backup");
async function main() {
  if (!process.argv[2]) throw new Error("An encrypted backup path is required");
  const file = fs.readFileSync(process.argv[2]);
  if (file.subarray(0, 4).toString() !== "HDB1") throw new Error("Invalid backup header");
  const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), file.subarray(4, 16));
  decipher.setAuthTag(file.subarray(16, 32));
  const plain = Buffer.concat([decipher.update(file.subarray(32)), decipher.final()]);
  const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  const url = new URL(adminUrl);
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const name = `helpdesk_restore_${crypto.randomBytes(8).toString("hex")}`;
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.PG_RESTORE_BIN || "pg_restore", [...pgArgs(url), "-d", name, "--no-owner", "--no-acl", "--exit-on-error"], { env: pgEnv(url), stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", reject); child.stdin.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error("Restore failed")));
      child.stdin.end(plain);
    });
    const target = new URL(adminUrl); target.pathname = `/${name}`;
    const restored = new PrismaClient({ datasources: { db: { url: target.href } } });
    try {
      await restored.user.count(); await restored.policyEvent.count(); await restored.chatSession.count();
      console.log("Encrypted backup authenticated; restore and key-table queries passed in an isolated disposable database.");
    } finally { await restored.$disconnect(); }
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  }
}
main().catch(() => { console.error("Restore verification failed; no production database restore was attempted."); process.exitCode = 1; });
