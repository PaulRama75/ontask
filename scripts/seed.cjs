// Seeds dev login accounts. Run: node scripts/seed.cjs
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const dk = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${dk}`;
}

async function ensureUser({ email, password, role, name }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`${role} already exists: ${email}`);
    return;
  }
  await prisma.user.create({ data: { email, name, role, passwordHash: hashPassword(password) } });
  console.log(`Created ${role}: ${email} / ${password}`);
}

async function main() {
  await ensureUser({
    email: process.env.SEED_ADMIN_EMAIL || "admin@fer.local",
    password: process.env.SEED_ADMIN_PASSWORD || "changeme123",
    role: "SUPER_ADMIN",
    name: "Super Admin",
  });
  await ensureUser({
    email: process.env.SEED_PM_EMAIL || "pm@fer.local",
    password: process.env.SEED_PM_PASSWORD || "pmpass123",
    role: "PROJECT_MANAGER",
    name: "Project Manager",
  });
  await ensureUser({
    email: process.env.SEED_AM_EMAIL || "am@fer.local",
    password: process.env.SEED_AM_PASSWORD || "ampass123",
    role: "ACCOUNT_MANAGER",
    name: "Account Manager",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
