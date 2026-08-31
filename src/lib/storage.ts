import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Storage abstraction. LOCAL uses the filesystem (dev only — App Platform's disk
// is ephemeral). S3 uses DigitalOcean Spaces (S3-compatible) for production.
// The rest of the app only depends on saveFile() / getFile() / the storageKey string.

export type SavedFile = {
  storageKey: string;
  size: number;
};

const DRIVER = process.env.STORAGE_DRIVER ?? "LOCAL";
const LOCAL_DIR = process.env.LOCAL_STORAGE_DIR ?? "./storage";
// Top-level folder that holds the per-employee document library.
const LIBRARY_ROOT = "library";

function localPathFor(key: string) {
  return path.join(/* turbopackIgnore: true */ process.cwd(), LOCAL_DIR, key);
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: false,
  });
  return s3Client;
}

const S3_BUCKET = process.env.S3_BUCKET;

async function s3Put(key: string, buffer: Buffer): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer }),
  );
}

async function s3Get(key: string): Promise<Buffer | null> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

// Turn arbitrary text into a safe, readable path segment.
function slug(input: string, fallback: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return s.length ? s : fallback;
}

// Organizes documents in the library as:
//   library/<Employee_Name>/<CATEGORY>-<unique>-<original-filename>
// Files for one employee thus live together under a folder bearing their name.
export async function saveFile(
  buffer: Buffer,
  originalName: string,
  opts: { employeeName?: string | null; employeeId: string; category?: string } = {
    employeeId: "unknown",
  },
): Promise<SavedFile> {
  const ext = path.extname(originalName);
  const baseName = slug(path.basename(originalName, ext), "file") + ext;
  const folder = slug(opts.employeeName ?? "", opts.employeeId);
  const category = opts.category ? `${slug(opts.category, "DOC")}-` : "";
  const unique = randomUUID().slice(0, 8);
  const key = `${LIBRARY_ROOT}/${folder}/${category}${unique}-${baseName}`;

  if (DRIVER === "LOCAL") {
    const dest = localPathFor(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { storageKey: key, size: buffer.length };
  }

  await s3Put(key, buffer);
  return { storageKey: key, size: buffer.length };
}

// Organizes invoice attachments as:
//   invoices/<invoiceId>/<CATEGORY>-<unique>-<original-filename>
export async function saveInvoiceFile(
  buffer: Buffer,
  originalName: string,
  opts: { invoiceId: string; category: string },
): Promise<SavedFile> {
  const ext = path.extname(originalName);
  const baseName = slug(path.basename(originalName, ext), "file") + ext;
  const category = slug(opts.category, "OTHER");
  const unique = randomUUID().slice(0, 8);
  const key = `invoices/${opts.invoiceId}/${category}-${unique}-${baseName}`;

  if (DRIVER === "LOCAL") {
    const dest = localPathFor(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { storageKey: key, size: buffer.length };
  }

  await s3Put(key, buffer);
  return { storageKey: key, size: buffer.length };
}

export async function getFile(
  key: string,
): Promise<{ buffer: Buffer } | null> {
  if (DRIVER === "LOCAL") {
    try {
      const buffer = await fs.readFile(localPathFor(key));
      return { buffer };
    } catch {
      return null;
    }
  }
  const buffer = await s3Get(key);
  return buffer ? { buffer } : null;
}
