// Seeds the initial Super Admin user. Run: node scripts/seed.cjs
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${dk}`;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@fer.local";
  const password = process.env.SEED_ADMIN_PASSWORD || "changeme123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super Admin already exists: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      passwordHash: hashPassword(password),
    },
  });
  console.log(`Created Super Admin: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
