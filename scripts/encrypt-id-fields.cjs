// One-time, idempotent migration: encrypt every Employee secret ID field at
// rest with AES-256-GCM ("enc:v1:" prefix), matching src/lib/crypto.ts. Covers
// driversLicenseNumber, safetyCouncilId, and twicNumber (the SSN column is
// handled by scripts/encrypt-ssns.cjs; the expiry DATE fields stay plaintext).
// Reuses the SAME SSN_ENCRYPTION_KEY — never generate a new one. Safe to
// re-run: already-encrypted values are skipped (a second run encrypts 0). Logs
// COUNTS only (and, on a per-row failure, the row id only); NEVER logs any
// field value or ciphertext.
//
// Run on Windows PowerShell from the repo root, with SSN_ENCRYPTION_KEY set.
// If it is only present in .env, export it into the process first:
//
//   $env:SSN_ENCRYPTION_KEY = (Get-Content .env | Select-String '^SSN_ENCRYPTION_KEY=').ToString().Split('=',2)[1].Trim('"')
//   node scripts/encrypt-id-fields.cjs
//
// (The script also reads the key straight from the process environment, e.g.
// in production where it is set as a host env var.)

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { createCipheriv, randomBytes } = require("crypto");

const prisma = new PrismaClient();

const VERSION = "v1";
const PREFIX = `enc:${VERSION}:`;

// The secret ID columns to encrypt at rest (the SSN column has its own script).
const FIELDS = ["driversLicenseNumber", "safetyCouncilId", "twicNumber"];

// Convenience fallback: if SSN_ENCRYPTION_KEY is not already in the process
// environment, try to read it from a local .env (never printed). Mirrors the
// documented PowerShell export step for interactive dev runs.
function loadKeyFromEnvFile() {
  if (process.env.SSN_ENCRYPTION_KEY) return;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*SSN_ENCRYPTION_KEY\s*=\s*(.*)\s*$/);
    if (m) {
      process.env.SSN_ENCRYPTION_KEY = m[1].trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
}

function getKey() {
  const b64 = process.env.SSN_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("SSN_ENCRYPTION_KEY is not set. Cannot encrypt ID fields.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("SSN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

function isEncrypted(stored) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

function encryptSecret(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

async function main() {
  loadKeyFromEnvFile();
  const key = getKey();

  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { driversLicenseNumber: { not: null } },
        { safetyCouncilId: { not: null } },
        { twicNumber: { not: null } },
      ],
    },
    select: { id: true, driversLicenseNumber: true, safetyCouncilId: true, twicNumber: true },
  });

  let encrypted = 0; // fields encrypted this run
  let skipped = 0; // fields already encrypted or empty
  let failed = 0; // rows that failed to update

  for (const e of employees) {
    const data = {};
    for (const field of FIELDS) {
      const value = e[field];
      if (!value || value.trim() === "") {
        skipped++;
        continue;
      }
      if (isEncrypted(value)) {
        skipped++; // already encrypted — idempotent
        continue;
      }
      data[field] = encryptSecret(value.trim(), key);
    }
    if (Object.keys(data).length === 0) continue;
    try {
      await prisma.employee.update({ where: { id: e.id }, data });
      encrypted += Object.keys(data).length;
    } catch (err) {
      // Row id ONLY — never any field value or a fragment of it.
      failed++;
      console.error(`Failed to encrypt ID fields for employee ${e.id}: ${err && err.message ? err.message : "unknown error"}`);
    }
  }

  console.log(`Encrypted ${encrypted}, skipped ${skipped} (already encrypted or empty)${failed ? `, failed ${failed}` : ""}.`);
}

main()
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
