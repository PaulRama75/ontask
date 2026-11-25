// LOCAL TESTING ONLY. Creates test logins, two teams of employees and a few
// invoices so the 5 boss tasks can be checked by hand on localhost.
// Run: node scripts/seed-test-users.cjs
// Safe to run more than once: anything that already exists is left as it is.
// Refuses to run unless DATABASE_URL points at localhost / 127.0.0.1.
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");

// Next.js reads .env on its own; a plain node script does not, so load it here.
try {
  const fs = require("fs");
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}

const dbUrl = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)(:|\/)/.test(dbUrl)) {
  console.error("STOP: DATABASE_URL is not a localhost database. This script is for local testing only.");
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = "Test@1234";
const PIN = "1234";

const hash = (s) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(s, salt, 64).toString("hex")}`;
};

const USERS = [
  { email: "superadmin@qa.local", name: "QA Super Admin", role: "SUPER_ADMIN" },
  { email: "admin@qa.local", name: "QA Admin", role: "ADMIN" },
  { email: "pm1@qa.local", name: "QA PM One (Team A)", role: "PROJECT_MANAGER" },
  { email: "pm2@qa.local", name: "QA PM Two (Team B)", role: "PROJECT_MANAGER" },
  { email: "pl1@qa.local", name: "QA Lead One (Team A)", role: "PROJECT_LEAD" },
  { email: "am@qa.local", name: "QA Account Manager", role: "ACCOUNT_MANAGER" },
  { email: "hr@qa.local", name: "QA HR", role: "HR" },
  { email: "safety@qa.local", name: "QA Safety", role: "SAFETY" },
  { email: "emp1@qa.local", name: "Alice TeamA", role: "EMPLOYEE" },
  { email: "emp2@qa.local", name: "Bob TeamB", role: "EMPLOYEE" },
];

const d = (s) => new Date(s + "T00:00:00Z");
const EMPLOYEES = [
  { firstName: "Alice", lastName: "TeamA", email: "emp1@qa.local", phone: "555-100-0001", site: "QA Site A",
    projectManagerEmail: "pm1@qa.local", projectLeadEmail: "pl1@qa.local",
    hireDate: d("2025-01-15"), twicExpiry: d("2027-03-01"), safetyCouncilExpiry: d("2026-12-31") },
  { firstName: "Carol", lastName: "TeamA", email: "carol.teama@qa.local", phone: "555-100-0002", site: "QA Site A",
    projectManagerEmail: "pm1@qa.local", projectLeadEmail: "pl1@qa.local",
    hireDate: d("2025-03-01"), twicExpiry: d("2027-06-01") },
  { firstName: "Bob", lastName: "TeamB", email: "emp2@qa.local", phone: "555-200-0001", site: "QA Site B",
    projectManagerEmail: "pm2@qa.local",
    hireDate: d("2024-11-01"), twicExpiry: d("2026-09-30"), safetyCouncilExpiry: d("2027-01-31") },
  { firstName: "Dave", lastName: "TeamB", email: "dave.teamb@qa.local", phone: "555-200-0002", site: "QA Site B",
    projectManagerEmail: "pm2@qa.local", hireDate: d("2025-05-20") },
];

async function main() {
  const ids = {};
  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      ids[u.email] = existing.id;
      console.log(`exists   ${u.role.padEnd(16)} ${u.email}`);
      continue;
    }
    const created = await prisma.user.create({
      data: { ...u, passwordHash: hash(PASSWORD), pinHash: hash(PIN) },
    });
    ids[u.email] = created.id;
    console.log(`created  ${u.role.padEnd(16)} ${u.email}`);
  }

  for (const e of EMPLOYEES) {
    const existing = await prisma.employee.findFirst({ where: { email: e.email } });
    if (existing) {
      console.log(`exists   employee         ${e.firstName} ${e.lastName}`);
      continue;
    }
    await prisma.employee.create({ data: { ...e, status: "SUBMITTED", source: "EXCEL" } });
    console.log(`created  employee         ${e.firstName} ${e.lastName}`);
  }

  const clients = {};
  for (const site of ["QA Site A", "QA Site B"]) {
    const email = `client@${site.replace(/\W+/g, "").toLowerCase()}.qa.local`;
    clients[site] = await prisma.client.upsert({
      where: { email_site: { email, site } },
      update: {},
      create: { name: `QA Client ${site.slice(-1)}`, email, site },
    });
  }

  const INVOICES = [
    { id: "qa_inv_pm1_draft", by: "pm1@qa.local", site: "QA Site A", status: "DRAFT" },
    { id: "qa_inv_pm1_sub", by: "pm1@qa.local", site: "QA Site A", status: "SUBMITTED" },
    { id: "qa_inv_pm2_sub", by: "pm2@qa.local", site: "QA Site B", status: "SUBMITTED" },
    { id: "qa_inv_admin_sent", by: "admin@qa.local", site: "QA Site B", status: "SENT" },
  ];
  for (const inv of INVOICES) {
    const existing = await prisma.invoice.findUnique({ where: { id: inv.id } });
    if (existing) {
      console.log(`exists   invoice          ${inv.id}`);
      continue;
    }
    await prisma.invoice.create({
      data: {
        id: inv.id,
        clientId: clients[inv.site].id,
        clientName: `QA ${inv.id}`,
        site: inv.site,
        status: inv.status,
        createdByUserId: ids[inv.by],
      },
    });
    console.log(`created  invoice          ${inv.id}`);
  }

  console.log(`\nAll test logins: password ${PASSWORD}, security PIN ${PIN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
