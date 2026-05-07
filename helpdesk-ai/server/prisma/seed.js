const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const accounts = [
    {
      email: "admin@helpdesk.com",
      plainPassword: "Admin@1234",
      firstName: "System",
      lastName: "Admin",
      role: Role.ADMIN
    },
    {
      email: "user@helpdesk.com",
      plainPassword: "User@1234",
      firstName: "HelpDesk",
      lastName: "User",
      role: Role.USER
    }
  ];

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.plainPassword, 12);
    const existing = await prisma.user.findUnique({ where: { email: account.email } });

    if (existing) {
      await prisma.user.update({
        where: { email: account.email },
        data: {
          passwordHash,
          firstName: account.firstName,
          lastName: account.lastName,
          role: account.role,
          isActive: true
        }
      });
      console.log(`${account.role} account updated: ${account.email}`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: account.email,
        passwordHash,
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
