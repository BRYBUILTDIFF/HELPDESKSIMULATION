require("dotenv").config();
const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const accounts = [
    {
      email: (process.env.SEED_ADMIN_EMAIL || "admin@helpdesk.com").trim().toLowerCase(),
      plainPassword: process.env.SEED_ADMIN_PASSWORD,
      firstName: "System",
      lastName: "Admin",
      role: Role.ADMIN
    },
    {
      email: (process.env.SEED_USER_EMAIL || "user@helpdesk.com").trim().toLowerCase(),
      plainPassword: process.env.SEED_USER_PASSWORD,
      firstName: "HelpDesk",
      lastName: "User",
      role: Role.USER
    }
  ];

  for (const account of accounts) {

    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) {
      console.log(`${account.role} account already exists; unchanged: ${account.email}`);
      continue;
    }

    if (!require("../src/utils/security").PASSWORD_REGEX.test(account.plainPassword || "")) {
      throw new Error(`Set a policy-compliant SEED_${account.role === Role.ADMIN ? "ADMIN" : "USER"}_PASSWORD before creating this account.`);
    }
    const passwordHash = await bcrypt.hash(account.plainPassword, 12);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        email: account.email,
        passwordHash,
        mustChangePassword: true,
        firstName: account.firstName,
        lastName: account.lastName,
        role: account.role
      }
    });
    console.log(`${account.role} account seeded: ${account.email}`);
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
