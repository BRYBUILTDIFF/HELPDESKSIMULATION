require("./owner-config");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");
const run = promisify(execFile);
function pgArgs(url) { return ["-h", url.hostname, "-p", url.port || "5432", "-U", decodeURIComponent(url.username)]; }
function pgEnv(url) { return { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }; }
function backupKey() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || "")) throw new Error("Set BACKUP_ENCRYPTION_KEY to 32 random hex-encoded bytes.");
  return Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex");
}
async function backup() {
  const key = backupKey();
  const url = new URL(process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL);
  const { stdout } = await run(process.env.PG_DUMP_BIN || "pg_dump", [...pgArgs(url), "-d", decodeURIComponent(url.pathname.slice(1)), "-Fc", "--no-owner", "--no-acl"], { env: pgEnv(url), encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(stdout), cipher.final()]);
  const directory = path.resolve(".security/backups");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `helpdesk-${Date.now()}.dump.enc`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from("HDB1"), iv, cipher.getAuthTag(), encrypted]), { mode: 0o600, flag: "wx" });
  console.log(`Encrypted backup written: ${file}`);
  return file;
}
module.exports = { backup, backupKey, pgArgs, pgEnv, run };
if (require.main === module) backup().catch(() => { console.error("Encrypted backup failed. Check database access, PostgreSQL tools, and encryption-key configuration."); process.exitCode = 1; });
