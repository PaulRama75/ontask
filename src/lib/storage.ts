import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

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

// Best-effort delete -- a missing file (already gone, or never wrote
// successfully) is not an error; the DB row is the source of truth.
export async function deleteFile(key: string): Promise<void> {
  if (DRIVER === "LOCAL") {
    try {
      await fs.unlink(localPathFor(key));
    } catch {
      // already gone
    }
    return;
  }
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {
    // already gone
  }
}

// Re-encodes JPEG/PNG/WebP uploads at a smaller max dimension and quality
// (the biggest win for phone-camera license/ID photos, which routinely come
// in at several MB). HEIC and PDF are left untouched -- HEIC re-encoding
// needs a libvips build with HEIF support this platform doesn't ship, and
// real PDF compression needs external tooling this server doesn't have.
// Never applied retroactively to files already stored; only new uploads.
// If compression ever fails or doesn't actually shrink the file, the
// original buffer is kept -- this must never block an upload.
const COMPRESSIBLE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIMENSION = 2000;

export async function compressImageIfApplicable(
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer> {
  if (!COMPRESSIBLE_MIME.has(mimeType)) return buffer;
  try {
    const img = sharp(buffer).rotate(); // rotate() bakes in EXIF orientation before resizing
    const resized = img.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    const out =
      mimeType === "image/png"
        ? await resized.png({ compressionLevel: 9, palette: true }).toBuffer()
        : mimeType === "image/webp"
          ? await resized.webp({ quality: 80 }).toBuffer()
          : await resized.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    return out.length > 0 && out.length < buffer.length ? out : buffer;
  } catch (err) {
    console.error("[storage] image compression failed, keeping original", err);
    return buffer;
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
  opts: {
    employeeName?: string | null;
    employeeId: string;
    category?: string;
    mimeType?: string;
  } = {
    employeeId: "unknown",
  },
): Promise<SavedFile> {
  if (opts.mimeType) buffer = await compressImageIfApplicable(buffer, opts.mimeType);
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
