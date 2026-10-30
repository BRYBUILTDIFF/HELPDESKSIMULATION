require("dotenv").config();
const prisma = require("../src/prisma");
const { comparePassword } = require("../src/utils/password");

// These values are checked only to retire credentials issued by older versions.
const retiredPasswords = ["password123", "Admin@1234", "User@1234"];
async function main() {
  let cursor = 0;
  let flagged = 0;
  while (true) {
    const users = await prisma.user.findMany({ where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: 100, select: { id: true, passwordHash: true } });
    if (!users.length) break;
    for (const user of users) {
      let retired = false;
      for (const password of retiredPasswords) {
        if (await comparePassword(password, user.passwordHash)) { retired = true; break; }
      }
      if (retired) {
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } }),
          prisma.refreshToken.deleteMany({ where: { userId: user.id } })
        ]);
        flagged += 1;
      }
      cursor = user.id;
    }
  }
  console.log(`Required password changes for ${flagged} accounts using retired default credentials.`);
}
main().catch(() => { console.error("Unable to flag legacy credentials. Check database availability and migrations."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
