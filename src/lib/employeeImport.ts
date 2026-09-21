import ExcelJS from "exceljs";
import { Readable } from "stream";
import { prisma } from "./prisma";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// Template columns, in order. `aliases` are extra header spellings accepted on upload.
export const IMPORT_COLUMNS = [
  { key: "firstName", header: "First Name", aliases: ["first"] },
  { key: "lastName", header: "Last Name", aliases: ["last", "surname"] },
  { key: "email", header: "Email", aliases: ["emailaddress"] },
  { key: "phone", header: "Phone", aliases: ["phonenumber", "mobile"] },
  { key: "addressLine1", header: "Address Line 1", aliases: ["address", "address1", "street"] },
  { key: "addressLine2", header: "Address Line 2", aliases: ["address2"] },
  { key: "city", header: "City", aliases: [] },
  { key: "state", header: "State", aliases: [] },
  { key: "zip", header: "Zip", aliases: ["zipcode", "postalcode"] },
  { key: "site", header: "Site", aliases: ["location", "jobsite"] },
  { key: "hireDate", header: "Hire Date", aliases: ["hired", "startdate"] },
  { key: "payRate", header: "Pay Rate", aliases: ["payrate"] },
  { key: "billRate", header: "Bill Rate", aliases: [] },
  { key: "projectLeadEmail", header: "Project Lead Email", aliases: ["projectlead"] },
  { key: "projectManagerEmail", header: "Project Manager Email", aliases: ["projectmanager"] },
  { key: "driversLicenseNumber", header: "Driver License #", aliases: ["driverlicense", "driverslicense", "driverlicensenumber", "dl"] },
  { key: "ssn", header: "SSN", aliases: ["ss", "socialsecuritynumber"] },
  { key: "safetyCouncilExpiry", header: "Safety Council Expiry", aliases: ["safetyexpiry"] },
  { key: "twicExpiry", header: "TWIC Expiry", aliases: ["twicexpiration"] },
  { key: "active", header: "Active", aliases: ["status"] },
] as const;

type ColKey = (typeof IMPORT_COLUMNS)[number]["key"];

export type ImportRecord = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  site: string | null;
  hireDate: Date | null;
  payRate: number | null;
  billRate: number | null;
  projectLeadEmail: string | null;
  projectManagerEmail: string | null;
  driversLicenseNumber: string | null;
  ssn: string | null;
  safetyCouncilExpiry: Date | null;
  twicExpiry: Date | null;
  active: boolean;
};

export type ParsedRow = { row: number; record: ImportRecord; errors: string[]; duplicateOf: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const headerLookup = new Map<string, ColKey>();
for (const c of IMPORT_COLUMNS) {
  headerLookup.set(norm(c.header), c.key);
  headerLookup.set(norm(c.key), c.key);
  for (const a of c.aliases) headerLookup.set(norm(a), c.key);
}

type Cell = string | number | boolean | Date | null;

// exceljs cells can be rich objects (hyperlinks, formulas, rich text).
function cellValue(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if (Array.isArray(o.richText)) return cellValue(o.richText.map((r: { text?: string }) => r.text ?? "").join(""));
    if ("text" in o) return cellValue(o.text);
  }
  return String(v);
}

const str = (v: Cell): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim() || null);

function parseDate(v: Cell): { value: Date | null; error?: string } {
  if (v == null) return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "invalid date" };
    return { value: new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  } else {
    return { value: null, error: `"${s}" is not a date (use YYYY-MM-DD or MM/DD/YYYY)` };
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { value: null, error: `"${s}" is not a real date` };
  }
  return { value: dt };
}

function parseMoney(v: Cell): { value: number | null; error?: string } {
  if (v == null) return { value: null };
  if (typeof v === "number") return v >= 0 ? { value: v } : { value: null, error: "negative rate" };
  const cleaned = String(v).replace(/[$,\s]/g, "");
  if (cleaned === "") return { value: null };
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return { value: null, error: `"${v}" is not a valid amount` };
  return { value: n };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function parseEmail(v: Cell, label: string, errors: string[]): string | null {
  const s = str(v);
  if (!s) return null;
  if (!EMAIL_RE.test(s)) {
    errors.push(`${label} "${s}" is not a valid email`);
    return null;
  }
  return s.toLowerCase();
}

async function readSheet(file: { name: string; buffer: Buffer }): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    await wb.csv.read(Readable.from(file.buffer));
  } else {
    // exceljs' typings predate Node's generic Buffer; the runtime value is fine.
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets.");
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals = (row.values as unknown[]).slice(1).map(cellValue);
    rows[n - 1] = vals;
  });
  return rows;
}

export async function parseImportFile(file: { name: string; buffer: Buffer }): Promise<ParsedRow[]> {
  const sheet = await readSheet(file);
  const headerIdx = sheet.findIndex((r) => r && r.some((c) => c != null));
  if (headerIdx < 0) throw new Error("The file is empty.");

  const colByIndex = new Map<number, ColKey>();
  sheet[headerIdx].forEach((h, i) => {
    const key = h == null ? undefined : headerLookup.get(norm(String(h)));
    if (key) colByIndex.set(i, key);
  });
  const present = new Set(colByIndex.values());
  if (!present.has("firstName") && !present.has("lastName")) {
    throw new Error('Header row must include "First Name" and "Last Name" columns (use the template).');
  }

  const out: ParsedRow[] = [];
  for (let r = headerIdx + 1; r < sheet.length; r++) {
    const cells = sheet[r];
    if (!cells || cells.every((c) => c == null)) continue;
    const raw: Partial<Record<ColKey, Cell>> = {};
    for (const [i, key] of colByIndex) raw[key] = cells[i] ?? null;

    const errors: string[] = [];
    const hire = parseDate(raw.hireDate ?? null);
    const safety = parseDate(raw.safetyCouncilExpiry ?? null);
    const twic = parseDate(raw.twicExpiry ?? null);
    const pay = parseMoney(raw.payRate ?? null);
    const bill = parseMoney(raw.billRate ?? null);
    if (hire.error) errors.push(`Hire Date: ${hire.error}`);
    if (safety.error) errors.push(`Safety Council Expiry: ${safety.error}`);
    if (twic.error) errors.push(`TWIC Expiry: ${twic.error}`);
    if (pay.error) errors.push(`Pay Rate: ${pay.error}`);
    if (bill.error) errors.push(`Bill Rate: ${bill.error}`);

    let zip = raw.zip ?? null;
    if (typeof zip === "number") zip = String(zip).padStart(5, "0");
    const state = str(raw.state ?? null);
    const activeRaw = str(raw.active ?? null)?.toLowerCase();

    const record: ImportRecord = {
      firstName: str(raw.firstName ?? null),
      lastName: str(raw.lastName ?? null),
      email: parseEmail(raw.email ?? null, "Email", errors),
      phone: str(raw.phone ?? null),
      addressLine1: str(raw.addressLine1 ?? null),
      addressLine2: str(raw.addressLine2 ?? null),
      city: str(raw.city ?? null),
      state: state && state.length === 2 ? state.toUpperCase() : state,
      zip: str(zip),
      site: str(raw.site ?? null),
      hireDate: hire.value,
      payRate: pay.value,
      billRate: bill.value,
      projectLeadEmail: parseEmail(raw.projectLeadEmail ?? null, "Project Lead Email", errors),
      projectManagerEmail: parseEmail(raw.projectManagerEmail ?? null, "Project Manager Email", errors),
      driversLicenseNumber: str(raw.driversLicenseNumber ?? null),
      ssn: str(raw.ssn ?? null),
      safetyCouncilExpiry: safety.value,
      twicExpiry: twic.value,
      active: !(activeRaw && ["no", "n", "false", "0", "inactive"].includes(activeRaw)),
    };
    if (!record.firstName && !record.lastName) errors.push("First or Last Name is required");
    out.push({ row: r + 1, record, errors, duplicateOf: null });
  }
  if (out.length === 0) throw new Error("No employee rows found under the header row.");
  if (out.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (${out.length}); the limit is ${MAX_IMPORT_ROWS} per file.`);
  return out;
}

const nameKey = (r: { firstName: string | null; lastName: string | null }) =>
  [r.firstName, r.lastName].filter(Boolean).join(" ").trim().toLowerCase();

// Marks rows that share an email or full name with an existing employee or an
// earlier row in the same file.
export async function flagDuplicates(rows: ParsedRow[]): Promise<void> {
  const existing = await prisma.employee.findMany({ select: { firstName: true, lastName: true, email: true } });
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const e of existing) {
    const em = e.email?.trim().toLowerCase();
    if (em) byEmail.set(em, "an existing employee");
    const nm = nameKey(e);
    if (nm) byName.set(nm, "an existing employee");
  }
  for (const r of rows) {
    if (r.errors.length) continue;
    const em = r.record.email;
    const nm = nameKey(r.record);
    const hit = (em && byEmail.get(em)) || (nm && byName.get(nm)) || null;
    if (hit) r.duplicateOf = hit;
    if (em && !byEmail.has(em)) byEmail.set(em, `row ${r.row}`);
    if (nm && !byName.has(nm)) byName.set(nm, `row ${r.row}`);
  }
}

// Previous employees skip onboarding entirely: no link, no emails, created as Approved.
export async function importRows(rows: ParsedRow[], createdById: string): Promise<number> {
  const now = new Date();
  const data = rows.map(({ record: r }) => ({
    ...r,
    status: "APPROVED",
    source: "EXCEL",
    approved: true,
    approvedAt: now,
    hrReviewed: true,
    hrReviewedAt: now,
    ratesAssignedAt: r.payRate != null && r.billRate != null ? now : null,
    createdById,
  }));
  const res = await prisma.employee.createMany({ data });
  return res.count;
}
