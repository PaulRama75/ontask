import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

// Storage abstraction. Phase 1 uses the local filesystem.
// To switch to DigitalOcean Spaces: set STORAGE_DRIVER=S3 and fill S3_* env vars,
// then implement the S3 branch with @aws-sdk/client-s3 (PutObjectCommand).
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
  return path.join(process.cwd(), LOCAL_DIR, key);
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

  // TODO(S3): implement DigitalOcean Spaces upload here.
  throw new Error(`Storage driver "${DRIVER}" not implemented yet`);
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
  throw new Error(`Storage driver "${DRIVER}" not implemented yet`);
}
