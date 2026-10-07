import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";
const PREFIX = `enc:${VERSION}:`;

function getKey(): Buffer {
  const b64 = process.env.SSN_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("SSN_ENCRYPTION_KEY is not set. SSN encryption/decryption cannot proceed.");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("SSN_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

// stored string: "enc:v1:" + base64( iv(12) | authTag(16) | ciphertext )
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // graceful transition: plaintext passes through
  const key = getKey();
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Display/search-only decrypt: never throws. Returns null on bad key / tampered
// tag / legacy corruption so one bad row renders "—" instead of crashing.
// Write paths must NOT use this — they must fail loudly.
export function safeDecrypt(stored: string | null): string | null {
  if (stored == null) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

// Encrypt an SSN for storage. Empty/whitespace-only → null (store nothing);
// otherwise encrypt the trimmed value.
export function encSsn(ssn: string | null | undefined): string | null {
  if (ssn == null) return null;
  const trimmed = ssn.trim();
  if (trimmed === "") return null;
  return encryptSecret(trimmed);
}

// Mask a decrypted SSN for display. Never reveals more than the last 4 digits,
// and reveals no digit when fewer than 4 are present.
export function maskSsn(decrypted: string | null): string {
  if (decrypted == null || decrypted.trim() === "") return "—";
  const digits = decrypted.replace(/\D/g, "");
  if (digits.length >= 4) return "•••••" + digits.slice(-4);
  if (digits.length >= 1) return "•".repeat(digits.length);
  return "—";
}
