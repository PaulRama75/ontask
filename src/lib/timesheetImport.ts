import ExcelJS from "exceljs";
import { Readable } from "stream";
import { prisma } from "./prisma";
import { weekEndingFor, parseIsoDate, isoDate } from "./timesheetWeek";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// One row per employee-day. Bulk timesheet entry -- e.g. an office manager
// re-keying paper timesheets, or migrating from an old spreadsheet.
export const IMPORT_COLUMNS = [
  { key: "employeeEmail", header: "Employee Email", aliases: ["email"] },
  { key: "date", header: "Date", aliases: ["workdate"] },
  { key: "clientName", header: "Client Name", aliases: ["client"] },
  { key: "location", header: "Location", aliases: [] },
  { key: "jobNumber", header: "Job Number", aliases: ["ferjobnumber", "job"] },
  { key: "afeNumber", header: "AFE #", aliases: ["afe"] },
  { key: "woNumber", header: "WO #", aliases: ["wo"] },
  { key: "details", header: "Details", aliases: ["description"] },
  { key: "stHours", header: "ST Hours", aliases: ["sthours"] },
  { key: "otHours", header: "OT Hours", aliases: ["othours"] },
  { key: "ptoHours", header: "PTO Hours", aliases: ["ptohours"] },
  { key: "vacationHours", header: "Vacation Hours", aliases: ["vacation"] },
  { key: "holidayHours", header: "Holiday Hours", aliases: ["holiday"] },
  { key: "perDiem", header: "Per Diem", aliases: [] },
  { key: "mileageDriven", header: "Miles Driven", aliases: ["miles"] },
  { key: "mileageAmount", header: "Mileage $ Amount", aliases: ["mileageamount", "mileage$"] },
  { key: "lodging", header: "Lodging", aliases: [] },
  { key: "meals", header: "Meals", aliases: [] },
  { key: "airfare", header: "Airfare", aliases: [] },
  { key: "fuel", header: "Fuel", aliases: [] },
  { key: "carRental", header: "Car Rental", aliases: ["carrent"] },
  { key: "gasoline", header: "Gasoline", aliases: [] },
  { key: "parking", header: "Parking", aliases: [] },
  { key: "misc", header: "Misc", aliases: ["miscellaneous"] },
  { key: "expenseDescription", header: "Expense Description", aliases: [] },
  { key: "advancedToEmployee", header: "Advanced To Employee", aliases: ["advanced"] },
] as const;

type ColKey = (typeof IMPORT_COLUMNS)[number]["key"];
type Cell = string | number | boolean | Date | null;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const headerLookup = new Map<string, ColKey>();
for (const c of IMPORT_COLUMNS) {
  headerLookup.set(norm(c.header), c.key);
  headerLookup.set(norm(c.key), c.key);
  for (const a of c.aliases) headerLookup.set(norm(a), c.key);
}

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
const str = (v: Cell): string | null => (v == null ? null : v instanceof Date ? isoDate(v) : String(v).trim() || null);

function parseDateCell(v: Cell): { value: Date | null; error?: string } {
  if (v == null) return { value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { value: null, error: "invalid date" };
    return { value: new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) };
  }
  const s = String(v).trim();
  const iso = parseIsoDate(s.slice(0, 10));
  if (iso) return { value: iso };
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const d = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
    return { value: d };
  }
  return { value: null, error: `"${s}" is not a date (use YYYY-MM-DD or MM/DD/YYYY)` };
}

function parseNum(v: Cell): { value: number | null; error?: string } {
  if (v == null) return { value: null };
  if (typeof v === "number") return v >= 0 ? { value: v } : { value: null, error: "negative value" };
  const cleaned = String(v).replace(/[$,\s]/g, "");
  if (cleaned === "") return { value: null };
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return { value: null, error: `"${v}" is not a valid number` };
  return { value: n };
}

export type ImportDayRecord = {
  employeeEmail: string | null;
  date: Date | null;
  clientName: string | null;
  location: string | null;
  jobNumber: string | null;
  afeNumber: string | null;
  woNumber: string | null;
  details: string | null;
  stHours: number | null;
  otHours: number | null;
  ptoHours: number | null;
  vacationHours: number | null;
  holidayHours: number | null;
  perDiem: number | null;
  mileageDriven: number | null;
  mileageAmount: number | null;
  lodging: number | null;
  meals: number | null;
  airfare: number | null;
  fuel: number | null;
  carRental: number | null;
  gasoline: number | null;
  parking: number | null;
  misc: number | null;
  expenseDescription: string | null;
  advancedToEmployee: number | null;
};

export type ParsedTimesheetRow = {
  row: number;
  record: ImportDayRecord;
  employeeId: string | null;
  errors: string[];
};

async function readSheet(file: { name: string; buffer: Buffer }): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  if (file.name.toLowerCase().endsWith(".csv")) {
    await wb.csv.read(Readable.from(file.buffer));
  } else {
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheets.");
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    rows[n - 1] = (row.values as unknown[]).slice(1).map(cellValue);
  });
  return rows;
}

const NUMERIC_KEYS: ColKey[] = [
  "stHours", "otHours", "ptoHours", "vacationHours", "holidayHours", "perDiem",
  "mileageDriven", "mileageAmount", "lodging", "meals", "airfare", "fuel",
  "carRental", "gasoline", "parking", "misc", "advancedToEmployee",
];

export async function parseTimesheetImportFile(file: { name: string; buffer: Buffer }): Promise<ParsedTimesheetRow[]> {
  const sheet = await readSheet(file);
  const headerIdx = sheet.findIndex((r) => r && r.some((c) => c != null));
  if (headerIdx < 0) throw new Error("The file is empty.");

  const colByIndex = new Map<number, ColKey>();
  sheet[headerIdx].forEach((h, i) => {
    const key = h == null ? undefined : headerLookup.get(norm(String(h)));
    if (key) colByIndex.set(i, key);
  });
  const present = new Set(colByIndex.values());
  if (!present.has("employeeEmail") || !present.has("date")) {
    throw new Error('Header row must include "Employee Email" and "Date" columns (use the template).');
  }

  // Resolve every referenced employee email to an id in one query.
  const rawRows: { row: number; raw: Partial<Record<ColKey, Cell>> }[] = [];
  for (let r = headerIdx + 1; r < sheet.length; r++) {
    const cells = sheet[r];
    if (!cells || cells.every((c) => c == null)) continue;
    const raw: Partial<Record<ColKey, Cell>> = {};
    for (const [i, key] of colByIndex) raw[key] = cells[i] ?? null;
    rawRows.push({ row: r + 1, raw });
  }
  if (rawRows.length === 0) throw new Error("No data rows found under the header row.");
  if (rawRows.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (${rawRows.length}); the limit is ${MAX_IMPORT_ROWS}.`);

  const emails = [...new Set(rawRows.map((r) => str(r.raw.employeeEmail ?? null)?.toLowerCase()).filter((e): e is string => !!e))];
  const employees = await prisma.employee.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(employees.map((e) => [e.email!.toLowerCase(), e.id]));

  return rawRows.map(({ row, raw }): ParsedTimesheetRow => {
    const errors: string[] = [];
    const email = str(raw.employeeEmail ?? null);
    const employeeId = email ? byEmail.get(email.toLowerCase()) ?? null : null;
    if (!email) errors.push("Employee Email is required");
    else if (!employeeId) errors.push(`No employee found with email "${email}"`);

    const date = parseDateCell(raw.date ?? null);
    if (date.error) errors.push(`Date: ${date.error}`);
    if (!date.value && !date.error) errors.push("Date is required");

    const numbers: Partial<Record<ColKey, number | null>> = {};
    for (const k of NUMERIC_KEYS) {
      const parsed = parseNum(raw[k] ?? null);
      if (parsed.error) errors.push(`${k}: ${parsed.error}`);
      numbers[k] = parsed.value;
    }

    const record: ImportDayRecord = {
      employeeEmail: email,
      date: date.value,
      clientName: str(raw.clientName ?? null),
      location: str(raw.location ?? null),
      jobNumber: str(raw.jobNumber ?? null),
      afeNumber: str(raw.afeNumber ?? null),
      woNumber: str(raw.woNumber ?? null),
      details: str(raw.details ?? null),
      stHours: numbers.stHours ?? null,
      otHours: numbers.otHours ?? null,
      ptoHours: numbers.ptoHours ?? null,
      vacationHours: numbers.vacationHours ?? null,
      holidayHours: numbers.holidayHours ?? null,
      perDiem: numbers.perDiem ?? null,
      mileageDriven: numbers.mileageDriven ?? null,
      mileageAmount: numbers.mileageAmount ?? null,
      lodging: numbers.lodging ?? null,
      meals: numbers.meals ?? null,
      airfare: numbers.airfare ?? null,
      fuel: numbers.fuel ?? null,
      carRental: numbers.carRental ?? null,
      gasoline: numbers.gasoline ?? null,
      parking: numbers.parking ?? null,
      misc: numbers.misc ?? null,
      expenseDescription: str(raw.expenseDescription ?? null),
      advancedToEmployee: numbers.advancedToEmployee ?? null,
    };
    return { row, record, employeeId, errors };
  });
}

// Upserts one Timesheet (per employee+week) and one TimesheetDay per row.
// Rows for the same employee+week share the Timesheet header fields --
// the last row seen for a week wins for clientName/location/jobNumber/advancedToEmployee.
export async function importTimesheetRows(rows: ParsedTimesheetRow[]): Promise<number> {
  let count = 0;
  for (const r of rows) {
    if (r.errors.length > 0 || !r.employeeId || !r.record.date) continue;
    const weekEnding = weekEndingFor(r.record.date);
    const ts = await prisma.timesheet.upsert({
      where: { employeeId_weekEnding: { employeeId: r.employeeId, weekEnding } },
      update: {
        clientName: r.record.clientName ?? undefined,
        location: r.record.location ?? undefined,
        jobNumber: r.record.jobNumber ?? undefined,
        advancedToEmployee: r.record.advancedToEmployee ?? undefined,
      },
      create: {
        employeeId: r.employeeId,
        weekEnding,
        clientName: r.record.clientName,
        location: r.record.location,
        jobNumber: r.record.jobNumber,
        advancedToEmployee: r.record.advancedToEmployee,
      },
    });
    await prisma.timesheetDay.upsert({
      where: { timesheetId_date: { timesheetId: ts.id, date: r.record.date } },
      update: {
        jobNumber: r.record.jobNumber,
        afeNumber: r.record.afeNumber,
        woNumber: r.record.woNumber,
        details: r.record.details,
        stHours: r.record.stHours,
        otHours: r.record.otHours,
        ptoHours: r.record.ptoHours,
        vacationHours: r.record.vacationHours,
        holidayHours: r.record.holidayHours,
        perDiem: r.record.perDiem,
        mileageDriven: r.record.mileageDriven,
        mileageAmount: r.record.mileageAmount,
        lodging: r.record.lodging,
        meals: r.record.meals,
        airfare: r.record.airfare,
        fuel: r.record.fuel,
        carRental: r.record.carRental,
        gasoline: r.record.gasoline,
        parking: r.record.parking,
        misc: r.record.misc,
        expenseDescription: r.record.expenseDescription,
      },
      create: {
        timesheetId: ts.id,
        date: r.record.date,
        jobNumber: r.record.jobNumber,
        afeNumber: r.record.afeNumber,
        woNumber: r.record.woNumber,
        details: r.record.details,
        stHours: r.record.stHours,
        otHours: r.record.otHours,
        ptoHours: r.record.ptoHours,
        vacationHours: r.record.vacationHours,
        holidayHours: r.record.holidayHours,
        perDiem: r.record.perDiem,
        mileageDriven: r.record.mileageDriven,
        mileageAmount: r.record.mileageAmount,
        lodging: r.record.lodging,
        meals: r.record.meals,
        airfare: r.record.airfare,
        fuel: r.record.fuel,
        carRental: r.record.carRental,
        gasoline: r.record.gasoline,
        parking: r.record.parking,
        misc: r.record.misc,
        expenseDescription: r.record.expenseDescription,
      },
    });
    count++;
  }
  return count;
}
