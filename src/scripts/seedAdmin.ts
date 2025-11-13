import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/hash";
import { env } from "../config/env";

async function main() {
  console.log("Seeding SUPER_ADMIN user...");

  const existing = await prisma.user.findUnique({
    where: { email: env.seedAdminEmail },
  });

  if (existing) {
    console.log("Admin already exists with that email. Skipping.");
    process.exit(0);
  }

  const pwHash = await hashPassword(env.seedAdminPassword);

  const admin = await prisma.user.create({
    data: {
      name: env.seedAdminName,
      email: env.seedAdminEmail,
      phone: env.seedAdminPhone,
      passwordHash: pwHash,
      role: "SUPER_ADMIN",
      active: true,
    },
  });

  console.log("Created SUPER_ADMIN:");
  console.log({
    id: admin.id,
    email: admin.email,
    password: env.seedAdminPassword,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
