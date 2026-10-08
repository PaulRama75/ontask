// One-time, idempotent migration: encrypt every Employee.ssn at rest with
// AES-256-GCM ("enc:v1:" prefix), matching src/lib/crypto.ts. Safe to re-run —
// already-encrypted values are skipped. Logs COUNTS only (and, on a per-row
// failure, the row id only); NEVER logs any SSN value or ciphertext.
//
// Run on Windows PowerShell from the repo root, with SSN_ENCRYPTION_KEY set.
// If it is only present in .env, export it into the process first:
//
//   $env:SSN_ENCRYPTION_KEY = (Get-Content .env | Select-String '^SSN_ENCRYPTION_KEY=').ToString().Split('=',2)[1].Trim('"')
//   node scripts/encrypt-ssns.cjs
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
    throw new Error("SSN_ENCRYPTION_KEY is not set. Cannot encrypt SSNs.");
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
    where: { ssn: { not: null } },
    select: { id: true, ssn: true },
  });

  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const e of employees) {
    const value = e.ssn;
    if (!value || value.trim() === "") {
      skipped++;
      continue;
    }
    if (isEncrypted(value)) {
      skipped++; // already encrypted — idempotent
      continue;
    }
    try {
      const enc = encryptSecret(value.trim(), key);
      await prisma.employee.update({ where: { id: e.id }, data: { ssn: enc } });
      encrypted++;
    } catch (err) {
      // Row id ONLY — never the SSN value or any fragment of it.
      failed++;
      console.error(`Failed to encrypt SSN for employee ${e.id}: ${err && err.message ? err.message : "unknown error"}`);
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
