require("./owner-config");
const fs = require("fs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
let stage = "load maintenance configuration";
async function main() {
  if (!process.argv.includes("--apply")) { console.log("Use --apply to provision helpdesk_runtime and switch only the local runtime DATABASE_URL. ADMIN_DATABASE_URL is preserved for migrations."); return; }
  const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (process.argv.includes("--env-file") && !process.env.ADMIN_DATABASE_URL) throw new Error("Cloud maintenance requires ADMIN_DATABASE_URL");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const password = crypto.randomBytes(32).toString("hex");
  const role = "helpdesk_runtime";
  try {
    await admin.$transaction(async tx => {
      stage = "inspect runtime role";
      const roles = await tx.$queryRaw`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = ${role}`;
      if (roles.some(existing => existing.rolsuper || existing.rolcreatedb || existing.rolcreaterole || existing.rolbypassrls)) throw new Error("Existing runtime role is privileged; review manually");
      stage = "create runtime role";
      // PostgreSQL defaults new roles to NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS.
      // Managed owners cannot always explicitly alter those protected attributes.
      if (!roles.length) await tx.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN NOINHERIT`);
      const memberships = await tx.$queryRaw`SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=${role}`;
      if (memberships.length) throw new Error("Runtime role has unexpected memberships; review manually");
      stage = "configure runtime role";
      await tx.$executeRawUnsafe(`ALTER ROLE ${role} WITH LOGIN NOINHERIT PASSWORD '${password}'`);
      const database = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
      if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error("Unexpected database name");
      stage = "grant application permissions";
      await tx.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${database}" TO ${role}`);
      await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      const tables = ["User", "RefreshToken", "UserSessionState", "PolicyConversation", "PolicyConfig", "PolicyRule", "SimulationModule", "SimulationCompletion", "SimulationSession", "PolicyEvent", "ChatSession", "RequestLimit", "PromptInsightDismissal", "SimulationAttempt", "SessionRestriction", "SimulationDraft", "ChatTurn"];
      for (const table of tables) await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO ${role}`);
      for (const table of ['SecurityLease', 'AdminSecurity']) await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${table}" TO ${role}`);
      for (const table of ["SimulationRevision", "SimulationTestReceipt"]) {
        await tx.$executeRawUnsafe(`REVOKE ALL ON TABLE "${table}" FROM ${role}`);
        await tx.$executeRawUnsafe(`GRANT SELECT, INSERT ON TABLE "${table}" TO ${role}`);
      }
      await tx.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
      await tx.$executeRawUnsafe(`REVOKE ALL ON TABLE "AdminAuditLog" FROM ${role}`);
      await tx.$executeRawUnsafe(`GRANT SELECT, INSERT ON TABLE "AdminAuditLog" TO ${role}`);
      await tx.$executeRawUnsafe(`GRANT UPDATE (status) ON TABLE "AdminAuditLog" TO ${role}`);
    });
    const runtimeUrl = new URL(adminUrl); runtimeUrl.username = role; runtimeUrl.password = password;
    const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl.href } } });
    try {
      stage = "verify runtime identity";
      const [identity] = await runtime.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
      if (Object.values(identity).some(Boolean)) throw new Error("Unexpected privileged runtime role");
      await runtime.$transaction(async tx => {
      stage = "verify runtime transaction and table access";
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(991122)::text AS locked`;
      await tx.user.count();
      await tx.sessionRestriction.count();
      await tx.adminAuditLog.count();
    });
    } finally { await runtime.$disconnect(); }
    if (process.argv.includes("--env-file")) {
      stage = "write cloud runtime file";
      const outputPath = ".security/cloud-runtime.env";
      fs.mkdirSync(".security", { recursive: true });
      fs.writeFileSync(outputPath, `DATABASE_URL=${JSON.stringify(runtimeUrl.href)}\n`, { mode: 0o600 });
      console.log("Cloud runtime role verified. DATABASE_URL saved to .security/cloud-runtime.env. Local environment files unchanged. Re-running rotates this role's password.");
      return;
    }
    let env = fs.readFileSync(".env", "utf8");
    fs.mkdirSync(".security", { recursive: true });
    let owner = fs.existsSync(".security/owner.env") ? fs.readFileSync(".security/owner.env", "utf8") : "";
    const ownerLine = `ADMIN_DATABASE_URL=${JSON.stringify(adminUrl)}`;
    owner = /^ADMIN_DATABASE_URL=.*$/m.test(owner) ? owner.replace(/^ADMIN_DATABASE_URL=.*$/m, () => ownerLine) : `${owner.trimEnd()}\n${ownerLine}\n`;
    fs.writeFileSync(".security/owner.env", owner, { mode: 0o600 });
    env = env.replace(/^ADMIN_DATABASE_URL=.*\r?\n?/m, "");
    for (const [key, value] of Object.entries({ DATABASE_URL: runtimeUrl.href })) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      env = pattern.test(env) ? env.replace(pattern, () => line) : `${env.trimEnd()}\n${line}\n`;
    }
    fs.writeFileSync(".env", env);
    console.log("Runtime role provisioned and verified; local DATABASE_URL switched. Restart the backend. Use ADMIN_DATABASE_URL only for migrations/backup/restore.");
  } finally { await admin.$disconnect(); }
}
main().catch((error) => {
  console.error("Runtime-role setup failed.");

  // Display only limited diagnostic information.
  // Never print the complete error, stack, URL or credentials.
  console.error("Error type:", error?.name || "Unknown");
  console.error("Prisma error code:", error?.code || "N/A");
  console.error("Setup stage:", stage);
  const sqlState = String(error?.meta?.code || "");
  if (/^[0-9A-Z]{5}$/.test(sqlState)) console.error("PostgreSQL code:", sqlState);

  process.exitCode = 1;
});
