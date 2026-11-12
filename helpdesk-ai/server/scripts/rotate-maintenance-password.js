require("./owner-config");
const fs = require("fs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
async function main() {
  if (!process.argv.includes("--apply")) { console.log("Use --apply to rotate the configured local maintenance database password. Other database clients must update their stored password."); return; }
  const old = fs.readFileSync(".security/owner.env", "utf8");
  const url = new URL(process.env.ADMIN_DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("This helper is limited to the local database");
  const role = decodeURIComponent(url.username);
  if (!/^[a-zA-Z0-9_]+$/.test(role)) throw new Error("Unexpected role name");
  const password = crypto.randomBytes(32).toString("hex");
  const admin = new PrismaClient({ datasources: { db: { url: url.href } } });
  url.password = password;
  let committed = false;
  try {
    await admin.$transaction(async tx => {
      await tx.$executeRawUnsafe(`ALTER ROLE "${role}" PASSWORD '${password}'`);
      fs.writeFileSync(".security/owner.env", old.replace(/^ADMIN_DATABASE_URL=.*$/m, () => `ADMIN_DATABASE_URL=${JSON.stringify(url.href)}`), {mode:0o600});
    });
    committed = true;
    const verify = new PrismaClient({datasources:{db:{url:url.href}}});
    try { await verify.$queryRaw`SELECT 1`; } finally { await verify.$disconnect(); }
    console.log("Local maintenance password rotated and new connection verified. API runtime credentials are unchanged. Update any other local database clients from the protected owner configuration.");
  } catch(error) { if (!committed) fs.writeFileSync(".security/owner.env", old, {mode:0o600}); throw error; }
  finally { await admin.$disconnect(); }
}
main().catch(()=>{console.error("Maintenance password rotation failed; verify owner configuration before retrying.");process.exitCode=1;});
