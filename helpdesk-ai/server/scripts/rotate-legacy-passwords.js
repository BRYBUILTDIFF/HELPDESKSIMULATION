require("dotenv").config();
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const prisma = require("../src/prisma");
const { comparePassword, hashPassword } = require("../src/utils/password");
async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Use --apply to rotate retired local account credentials.");
  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("This recovery helper is restricted to local databases.");
  const candidates = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, email: true, passwordHash: true } });
  const credentials = [];
  let file;
  for (const user of candidates) {
    let retired = false;
    for (const old of ["password123", "Admin@1234", "User@1234"]) if (await comparePassword(old, user.passwordHash)) { retired = true; break; }
    if (!retired) continue;
    if (!file) {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "helpdesk-account-recovery-"));
      file = path.join(directory, "temporary-credentials.json");
      fs.writeFileSync(file, "[]", { flag: "wx", mode: 0o600 });
    }
    const password = crypto.randomBytes(24).toString("base64url");
    const passwordHash = await hashPassword(password);
    const credential = { email: user.email, temporaryPassword: password, passwordChangeRequired: true, applied: false };
    credentials.push(credential);
    // Persist recovery data before committing any password change.
    fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    credential.applied = await prisma.$transaction(async tx => {
      const updated = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } } });
      if (!updated.count) return false;
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      return true;
    });
    fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  }
  console.log("Retired local passwords rotated:", credentials.filter(item => item.applied).length);
  if (file) console.log("Recovery credentials saved locally:", file);
}
main().catch(error => { console.error("Local rotation failed", { code: error.code || error.name }); process.exitCode = 1; }).finally(() => prisma.$disconnect());
