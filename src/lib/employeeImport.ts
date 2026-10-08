import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { encSsn, encField } from "./crypto";

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
  // null = cell left blank: "Yes" for a new employee, unchanged for an update.
  active: boolean | null;
};

export type ParsedRow = { row: number; record: ImportRecord; errors: string[] };

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

// How each header in the uploaded file was understood, so the preview can show
// it for checking before anything is saved.
export type ColumnMapping = {
  mapped: { header: string; field: string }[];
  ignored: { header: string; reason: string }[];
};

export async function parseImportFile(
  file: { name: string; buffer: Buffer },
): Promise<{ rows: ParsedRow[]; columns: ColumnMapping }> {
  const sheet = await readSheet(file);
  const headerIdx = sheet.findIndex((r) => r && r.some((c) => c != null));
  if (headerIdx < 0) throw new Error("The file is empty.");

  const colByIndex = new Map<number, ColKey>();
  const firstHeaderFor = new Map<ColKey, string>();
  const columns: ColumnMapping = { mapped: [], ignored: [] };
  sheet[headerIdx].forEach((h, i) => {
    if (h == null) return;
    const header = String(h).trim();
    const key = headerLookup.get(norm(header));
    if (!key) {
      columns.ignored.push({ header, reason: "not a recognized column" });
    } else if (firstHeaderFor.has(key)) {
      // Two headers for one field: keep the first so the result is predictable.
      columns.ignored.push({ header, reason: `duplicate of "${firstHeaderFor.get(key)}"` });
    } else {
      firstHeaderFor.set(key, header);
      colByIndex.set(i, key);
      columns.mapped.push({ header, field: IMPORT_COLUMNS.find((c) => c.key === key)!.header });
    }
  });
  const present = new Set(colByIndex.values());
  if (!present.has("firstName") && !present.has("lastName")) {
    throw new Error('Header row must include "First Name" and "Last Name" columns (use the template).');
  }
  if (!present.has("email")) {
    throw new Error('No "Email" column found. Employees are matched by email, so the file needs an Email column (use the template).');
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
      // Encrypt the secret ID at this single parse-time point. This record
      // feeds BOTH write paths in applyImport — createMany for new rows and
      // employee.update for matched rows (toUpdate copies record values into
      // its data) — so the ciphertext is what reaches the DB in either case;
      // no raw plaintext ID is ever persisted. encField/encSsn are idempotent.
      // (safetyCouncilId/twicNumber are not import columns — only their
      // expiry DATE fields are, and those stay plaintext.)
      driversLicenseNumber: encField(str(raw.driversLicenseNumber ?? null)),
      ssn: encSsn(str(raw.ssn ?? null)),
      safetyCouncilExpiry: safety.value,
      twicExpiry: twic.value,
      active: activeRaw ? !["no", "n", "false", "0", "inactive"].includes(activeRaw) : null,
    };
    if (!record.firstName && !record.lastName) errors.push("First or Last Name is required");
    out.push({ row: r + 1, record, errors });
  }
  if (out.length === 0) throw new Error("No employee rows found under the header row.");
  if (out.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (${out.length}); the limit is ${MAX_IMPORT_ROWS} per file.`);
  return { rows: out, columns };
}

const nameKey = (r: { firstName: string | null; lastName: string | null }) =>
  [r.firstName, r.lastName].filter(Boolean).join(" ").trim().toLowerCase();

// Fields an import may overwrite on an existing employee. Email is the match
// key, so it's never changed; documents, approvals, archive and onboarding
// status are never touched.
const UPDATABLE = [
  "firstName",
  "lastName",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "zip",
  "site",
  "hireDate",
  "payRate",
  "billRate",
  "projectLeadEmail",
  "projectManagerEmail",
  "driversLicenseNumber",
  "ssn",
  "safetyCouncilExpiry",
  "twicExpiry",
  "active",
] as const;
type UpdatableKey = (typeof UPDATABLE)[number];

const LABEL: Record<UpdatableKey, string> = Object.fromEntries(
  IMPORT_COLUMNS.filter((c) => (UPDATABLE as readonly string[]).includes(c.key)).map((c) => [c.key, c.header]),
) as Record<UpdatableKey, string>;

type FieldValue = string | number | boolean | Date | null;

function same(a: FieldValue, b: FieldValue): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ad = a instanceof Date ? a.toISOString().slice(0, 10) : null;
    const bd = b instanceof Date ? b.toISOString().slice(0, 10) : null;
    return ad === bd;
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return a === b;
}

function display(key: UpdatableKey, v: FieldValue): string {
  if (v == null || v === "") return "(blank)";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "ssn") return `***-**-${String(v).replace(/\D/g, "").slice(-4)}`;
  return String(v);
}

export type Change = { field: string; from: string; to: string };

export type ClassifiedRow = ParsedRow & {
  action: "update" | "new" | "unchanged" | "skip";
  reason: string | null;
  matchId: string | null;
  changes: Change[];
  // Only the changed, non-blank fields -- what gets written for an update.
  data: Prisma.EmployeeUncheckedUpdateInput;
};

// Sorts every row into one of four groups so the same person is never added
// twice:
//   update    - matched one existing employee and something differs. A match is
//               the email on file, or -- when the email isn't on file yet --
//               the one employee with this exact name who has no email (their
//               email gets filled in)
//   unchanged - matched, but every filled-in value is already the same
//   new       - no match and the name isn't already on file
//   skip      - bad data, or matching would be a guess (see reasons below)
// allowNameMatches lets a row whose name matches someone already on file be
// added anyway, but only when it has its own, different email.
export async function classifyRows(rows: ParsedRow[], opts: { allowNameMatches: boolean }): Promise<ClassifiedRow[]> {
  const existing = await prisma.employee.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      zip: true,
      site: true,
      hireDate: true,
      payRate: true,
      billRate: true,
      projectLeadEmail: true,
      projectManagerEmail: true,
      driversLicenseNumber: true,
      ssn: true,
      safetyCouncilExpiry: true,
      twicExpiry: true,
      active: true,
    },
  });
  type Existing = (typeof existing)[number];
  const byEmail = new Map<string, Existing[]>();
  const byName = new Map<string, Existing[]>();
  for (const e of existing) {
    const em = e.email?.trim().toLowerCase();
    if (em) byEmail.set(em, [...(byEmail.get(em) ?? []), e]);
    const nm = nameKey(e);
    if (nm) byName.set(nm, [...(byName.get(nm) ?? []), e]);
  }

  const seenEmail = new Map<string, number>();
  const seenName = new Map<string, number>();
  const seenEmployee = new Map<string, number>();
  const out: ClassifiedRow[] = [];

  // Builds the update for a matched employee: only filled-in cells that differ.
  // fillEmail is set when the match was made by name onto someone with no
  // email on file -- the import then records their email too.
  const toUpdate = (base: ClassifiedRow, r: ParsedRow, current: Existing, fillEmail: string | null): ClassifiedRow => {
    const data: Record<string, FieldValue> = {};
    const changes: Change[] = [];
    if (fillEmail) {
      data.email = fillEmail;
      changes.push({ field: "Email", from: "(blank)", to: fillEmail });
    }
    for (const key of UPDATABLE) {
      const next = r.record[key] as FieldValue;
      if (next == null || next === "") continue; // blank cells never erase
      if (same(current[key], next)) continue;
      data[key] = next;
      changes.push({ field: LABEL[key], from: display(key, current[key]), to: display(key, next) });
    }
    return {
      ...base,
      action: changes.length ? "update" : "unchanged",
      matchId: current.id,
      changes,
      data: data as Prisma.EmployeeUncheckedUpdateInput,
    };
  };

  for (const r of rows) {
    const base: ClassifiedRow = { ...r, action: "skip", reason: null, matchId: null, changes: [], data: {} };
    const skip = (reason: string): ClassifiedRow => ({ ...base, action: "skip", reason });
    // One row per employee: a second row reaching the same person (by email
    // or by name) is skipped so two rows can't fight over one record.
    const claim = (row: ClassifiedRow): ClassifiedRow => {
      if (!row.matchId) return row;
      const prior = seenEmployee.get(row.matchId);
      if (prior) return skip(`Same employee as row ${prior}`);
      seenEmployee.set(row.matchId, r.row);
      return row;
    };
    if (r.errors.length) {
      out.push(skip(r.errors.join("; ")));
      continue;
    }

    const em = r.record.email;
    const nm = nameKey(r.record);

    if (em && seenEmail.has(em)) {
      out.push(skip(`Same email as row ${seenEmail.get(em)}`));
      continue;
    }
    if (em) seenEmail.set(em, r.row);

    // 1) Email already on file -> that employee.
    const emailMatches = em ? (byEmail.get(em) ?? []) : [];
    if (emailMatches.length > 1) {
      out.push(skip(`${emailMatches.length} employees already share this email; fix them in the Data Grid first`));
      continue;
    }
    if (emailMatches.length === 1) {
      if (nm) seenName.set(nm, r.row);
      out.push(claim(toUpdate(base, r, emailMatches[0], null)));
      continue;
    }

    // 2) Email not on file: look at who already has this name.
    if (nm && seenName.has(nm)) {
      out.push(skip(`Same name as row ${seenName.get(nm)}`));
      continue;
    }
    const nameMatches = nm ? (byName.get(nm) ?? []) : [];
    if (nameMatches.length > 0) {
      if (!em) {
        out.push(skip("No email in this row, and an employee with this name already exists (add their email to update them)"));
        continue;
      }
      const noEmailOnFile = nameMatches.filter((e) => !e.email?.trim());
      if (nameMatches.length === 1 && noEmailOnFile.length === 1) {
        // Same name, and the person on file has no email yet: it's them.
        seenName.set(nm, r.row);
        out.push(claim(toUpdate(base, r, noEmailOnFile[0], em)));
        continue;
      }
      if (nameMatches.length > 1) {
        out.push(skip(`${nameMatches.length} employees already have this name; can't tell which one this is`));
        continue;
      }
      if (!opts.allowNameMatches) {
        out.push(skip(`An employee with this name is already on file as ${nameMatches[0].email}`));
        continue;
      }
    }

    // 3) Nobody matches: a new employee.
    if (nm) seenName.set(nm, r.row);
    out.push({ ...base, action: "new" });
  }
  return out;
}

export type ApplyResult = { updated: number; created: number };

export async function applyImport(
  rows: ClassifiedRow[],
  opts: { update: boolean; create: boolean; createdById: string },
): Promise<ApplyResult> {
  const now = new Date();
  const updates = opts.update ? rows.filter((r) => r.action === "update") : [];
  const creates = opts.create ? rows.filter((r) => r.action === "new") : [];

  const ops: Prisma.PrismaPromise<unknown>[] = updates.map((r) =>
    prisma.employee.update({ where: { id: r.matchId! }, data: r.data }),
  );
  if (creates.length) {
    // Previous employees skip onboarding entirely: no link, no emails, created as Approved.
    ops.push(
      prisma.employee.createMany({
        data: creates.map(({ record: r }) => ({
          ...r,
          active: r.active ?? true,
          status: "APPROVED",
          source: "EXCEL",
          approved: true,
          approvedAt: now,
          hrReviewed: true,
          hrReviewedAt: now,
          ratesAssignedAt: r.payRate != null && r.billRate != null ? now : null,
          createdById: opts.createdById,
        })),
      }),
    );
  }
  await prisma.$transaction(ops);

  // Keep the onboarding workflow in step when an import completes both rates
  // for someone still mid-onboarding (same rule as entering them by hand).
  const rateIds = updates.filter((r) => "payRate" in r.data || "billRate" in r.data).map((r) => r.matchId!);
  if (rateIds.length) {
    await prisma.employee.updateMany({
      where: { id: { in: rateIds }, status: { in: ["SUBMITTED", "HR_REVIEW"] }, payRate: { not: null }, billRate: { not: null } },
      data: { status: "RATES_ASSIGNED", ratesAssignedAt: now },
    });
  }

  return { updated: updates.length, created: creates.length };
}
