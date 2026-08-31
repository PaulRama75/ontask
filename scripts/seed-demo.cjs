// Seeds the demo environment: login accounts + realistic-looking fake employees
// and invoices, so the demo site isn't just empty screens.
// Run: node scripts/seed-demo.cjs
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
    return existing;
  }
  const user = await prisma.user.create({
    data: { email, name, role, passwordHash: hashPassword(password) },
  });
  console.log(`Created ${role}: ${email} / ${password}`);
  return user;
}

const EMPLOYEES = [
  {
    firstName: "Jordan",
    lastName: "Demo",
    email: "jordan.demo@example.com",
    phone: "555-010-1001",
    ssn: "000-00-1001",
    addressLine1: "100 Demo Lane",
    city: "Houston",
    state: "TX",
    zip: "77001",
    driversLicenseNumber: "DL1000001",
    site: "Refinery Site A",
    status: "APPROVED",
    approved: true,
    approvedAt: new Date(),
    payRate: 22.5,
    billRate: 38,
    hireDate: new Date("2026-06-01"),
    frcNeeded: true,
    frcSize: "Large",
    creditCardApproved: false,
    emailNeeded: true,
    urgency: "URGENT",
    employmentType: "Full Time",
    positionType: "Field Personnel",
    directSupervisor: "Sam Rivera",
    jobNumber: "JOB-1001",
    jobSite: "Refinery Site A - Unit 3",
    drivingRecordRequired: true,
    siteSpecificsNeeded: true,
    fitTestNeeded: true,
    safetyEquipmentNeeded: "Hard Hat, Safety glasses, Gloves",
  },
  {
    firstName: "Casey",
    lastName: "Sample",
    email: "casey.sample@example.com",
    phone: "555-010-1002",
    ssn: "000-00-1002",
    addressLine1: "200 Sample Ave",
    city: "Baytown",
    state: "TX",
    zip: "77520",
    driversLicenseNumber: "DL1000002",
    site: "Terminal B",
    status: "SUBMITTED",
    payRate: 20,
    billRate: 34,
    urgency: "NON_URGENT",
    employmentType: "Part Time",
    positionType: "Administrative",
  },
  {
    firstName: "Taylor",
    lastName: "Example",
    email: "taylor.example@example.com",
    phone: "555-010-1003",
    ssn: "000-00-1003",
    addressLine1: "300 Example Blvd",
    city: "Deer Park",
    state: "TX",
    zip: "77536",
    driversLicenseNumber: "DL1000003",
    site: "Refinery Site A",
    status: "HR_REVIEW",
    payRate: 24,
    billRate: 40,
    employmentType: "1099 Employee",
    positionType: "Supervision",
    liftOperatorCertifications: "Forklift, Scissor Lift",
  },
  {
    firstName: "Morgan",
    lastName: "Placeholder",
    email: "morgan.placeholder@example.com",
    phone: "555-010-1004",
    ssn: "000-00-1004",
    addressLine1: "400 Placeholder Rd",
    city: "Pasadena",
    state: "TX",
    zip: "77502",
    driversLicenseNumber: "DL1000004",
    site: "Terminal B",
    status: "RATES_ASSIGNED",
    payRate: 19.75,
    billRate: 32,
    employmentType: "Full Time, Benefits",
    positionType: "Field Personnel",
    fitTestNeeded: false,
  },
  {
    firstName: "Riley",
    lastName: "Testcase",
    email: "riley.testcase@example.com",
    phone: "555-010-1005",
    addressLine1: "500 Testcase Way",
    city: "Houston",
    state: "TX",
    zip: "77002",
    status: "DRAFT",
    employmentType: "1099 Employee",
    positionType: "Management",
  },
];

async function main() {
  const pm = await ensureUser({
    email: process.env.SEED_ADMIN_EMAIL || "admin@fer.local",
    password: process.env.SEED_ADMIN_PASSWORD || "changeme123",
    role: "SUPER_ADMIN",
    name: "Demo Super Admin",
  });
  await ensureUser({
    email: process.env.SEED_PM_EMAIL || "pm@fer.local",
    password: process.env.SEED_PM_PASSWORD || "pmpass123",
    role: "PROJECT_MANAGER",
    name: "Demo Project Manager",
  });
  await ensureUser({
    email: process.env.SEED_AM_EMAIL || "am@fer.local",
    password: process.env.SEED_AM_PASSWORD || "ampass123",
    role: "ACCOUNT_MANAGER",
    name: "Demo Account Manager",
  });

  for (const emp of EMPLOYEES) {
    const existing = await prisma.employee.findUnique({ where: { email: emp.email } });
    if (existing) {
      console.log(`Employee already exists: ${emp.email}`);
      continue;
    }
    await prisma.employee.create({ data: emp });
    console.log(`Created employee: ${emp.firstName} ${emp.lastName}`);
  }

  const client = await prisma.client.upsert({
    where: { email_site: { email: "billing@democlient.example.com", site: "Refinery Site A" } },
    update: {},
    create: { name: "Demo Client Co.", email: "billing@democlient.example.com", site: "Refinery Site A" },
  });

  const existingInvoices = await prisma.invoice.count({ where: { clientId: client.id } });
  if (existingInvoices === 0) {
    await prisma.invoice.create({
      data: {
        clientId: client.id,
        site: "Refinery Site A",
        status: "SENT",
        createdByUserId: pm.id,
        sentAt: new Date(),
        lineItems: {
          create: [
            { description: "Inspection labor - week of 8/24", amount: 4200 },
            { description: "Equipment rental", amount: 800 },
          ],
        },
      },
    });
    await prisma.invoice.create({
      data: {
        clientId: client.id,
        site: "Refinery Site A",
        status: "AM_APPROVED",
        createdByUserId: pm.id,
        lineItems: {
          create: [{ description: "Inspection labor - week of 8/31", amount: 3900 }],
        },
      },
    });
    await prisma.invoice.create({
      data: {
        clientId: client.id,
        site: "Refinery Site A",
        status: "DRAFT",
        createdByUserId: pm.id,
        lineItems: {
          create: [{ description: "Inspection labor - week of 9/7 (in progress)", amount: 0 }],
        },
      },
    });
    console.log("Created 3 demo invoices");
  } else {
    console.log("Demo invoices already exist, skipping");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
