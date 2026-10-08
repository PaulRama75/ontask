import path from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "./prisma";
import { weekDates, isoDate, DAY_LABELS } from "./timesheetWeek";
import { clean, dateOnly } from "./formPdf";
import { FER_LOGO_PNG_BASE64 } from "./ferLogo";

// Exports one employee's saved week as (a) the original Time & Expense
// Report workbook, filled in, and (b) a one-page landscape PDF laid out like
// it. Both are built from the same TimesheetExport so they always agree.

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "time-expense-report.xlsx");

// One line of billable time. A day split across job numbers has several
// lines for the same date; `first` marks the day's first line.
export type ExportLine = {
  date: Date;
  dayIndex: number; // 0 = Mon .. 6 = Sun
  first: boolean;
  jobNumber: string | null; // as entered (blank = the week's FER Job #)
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
};

// One day's expenses (always 7, Mon..Sun).
export type ExportExpenseDay = {
  date: Date;
  lodging: number | null;
  meals: number | null;
  airfare: number | null;
  fuel: number | null;
  carRental: number | null;
  gasoline: number | null;
  parking: number | null;
  misc: number | null;
  expenseDescription: string | null;
};

export type TimesheetExport = {
  firstName: string;
  lastName: string;
  employeeName: string;
  weekEnding: Date;
  clientName: string | null;
  location: string | null;
  jobNumber: string | null;
  notes: string | null;
  advancedToEmployee: number | null;
  lines: ExportLine[]; // at least one per day, in day then line order
  days: ExportExpenseDay[];
};

const HOUR_KEYS = ["stHours", "otHours", "ptoHours", "vacationHours", "holidayHours"] as const;
const EXPENSE_KEYS = ["lodging", "meals", "airfare", "fuel", "carRental", "gasoline", "parking", "misc"] as const;

export async function loadTimesheetExport(employeeId: string, weekEnding: Date): Promise<TimesheetExport> {
  const [e, ts] = await Promise.all([
    prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, jobNumber: true },
    }),
    prisma.timesheet.findUnique({
      where: { employeeId_weekEnding: { employeeId, weekEnding } },
      include: { days: { orderBy: [{ date: "asc" }, { line: "asc" }] } },
    }),
  ]);
  const rowsByDate = new Map<string, NonNullable<typeof ts>["days"]>();
  for (const d of ts?.days ?? []) {
    const key = isoDate(d.date);
    rowsByDate.set(key, [...(rowsByDate.get(key) ?? []), d]);
  }

  const lines: ExportLine[] = [];
  const days: ExportExpenseDay[] = [];
  weekDates(weekEnding).forEach((date, dayIndex) => {
    const rows = rowsByDate.get(isoDate(date)) ?? [];
    (rows.length ? rows : [null]).forEach((d, k) =>
      lines.push({
        date,
        dayIndex,
        first: k === 0,
        jobNumber: d?.jobNumber ?? null,
        woNumber: d?.woNumber ?? null,
        details: d?.details ?? null,
        stHours: d?.stHours ?? null,
        otHours: d?.otHours ?? null,
        ptoHours: d?.ptoHours ?? null,
        vacationHours: d?.vacationHours ?? null,
        holidayHours: d?.holidayHours ?? null,
        perDiem: d?.perDiem ?? null,
        mileageDriven: d?.mileageDriven ?? null,
        mileageAmount: d?.mileageAmount ?? null,
      }),
    );
    // Expenses are entered once per day (stored on line 0); add up any lines
    // to be safe.
    const total = (k: (typeof EXPENSE_KEYS)[number]) =>
      rows.some((r) => r[k] != null) ? rows.reduce((s, r) => s + (r[k] ?? 0), 0) : null;
    days.push({
      date,
      lodging: total("lodging"),
      meals: total("meals"),
      airfare: total("airfare"),
      fuel: total("fuel"),
      carRental: total("carRental"),
      gasoline: total("gasoline"),
      parking: total("parking"),
      misc: total("misc"),
      expenseDescription: rows.map((r) => r.expenseDescription).filter(Boolean).join("; ") || null,
    });
  });

  const firstName = e.firstName?.trim() ?? "";
  const lastName = e.lastName?.trim() ?? "";
  return {
    firstName,
    lastName,
    employeeName: [firstName, lastName].filter(Boolean).join(" ") || "Employee",
    weekEnding,
    clientName: ts?.clientName ?? null,
    location: ts?.location ?? null,
    jobNumber: ts?.jobNumber ?? e.jobNumber ?? null,
    notes: ts?.notes ?? null,
    advancedToEmployee: ts?.advancedToEmployee ?? null,
    lines,
    days,
  };
}

// The FER Job # to print on a line: its own, or the week's when the line has
// time on it but no job number of its own (same fallback as the reports).
export function lineJobNumber(t: TimesheetExport, l: ExportLine): string {
  if (l.jobNumber) return l.jobNumber;
  const hasTime = [l.details, l.stHours, l.otHours, l.ptoHours, l.vacationHours, l.holidayHours, l.perDiem, l.mileageAmount].some(
    (v) => v != null && v !== "",
  );
  return hasTime ? (t.jobNumber ?? "") : "";
}

// Same naming as the paper template: FIRST_LAST_WE_20230108
export function timesheetFileBase(t: TimesheetExport): string {
  const part = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  const who = [part(t.firstName), part(t.lastName)].filter(Boolean).join("_") || "EMPLOYEE";
  return `${who}_WE_${isoDate(t.weekEnding).replace(/-/g, "")}`;
}

function sumLines(t: TimesheetExport, key: keyof ExportLine): number {
  return t.lines.reduce((s, l) => s + ((l[key] as number | null) ?? 0), 0);
}
function sumDays(t: TimesheetExport, key: keyof ExportExpenseDay): number {
  return t.days.reduce((s, d) => s + ((d[key] as number | null) ?? 0), 0);
}

export function timesheetTotals(t: TimesheetExport) {
  const perDiem = sumLines(t, "perDiem");
  const mileageAmount = sumLines(t, "mileageAmount");
  const expenses = Object.fromEntries(EXPENSE_KEYS.map((k) => [k, sumDays(t, k)])) as Record<
    (typeof EXPENSE_KEYS)[number],
    number
  >;
  const weekDollars = perDiem + mileageAmount; // the template's own "Total" column
  const totalEmployeeExpenses = weekDollars + Object.values(expenses).reduce((s, v) => s + v, 0);
  const advanced = t.advancedToEmployee ?? 0;
  return {
    hours: Object.fromEntries(HOUR_KEYS.map((k) => [k, sumLines(t, k)])) as Record<(typeof HOUR_KEYS)[number], number>,
    perDiem,
    mileageDriven: sumLines(t, "mileageDriven"),
    mileageAmount,
    weekDollars,
    expenses,
    totalEmployeeExpenses,
    advanced,
    amountDue: totalEmployeeExpenses - advanced,
  };
}

// ---------------------------------------------------------------- Excel

const TEMPLATE_DAY_ROWS = 7; // template rows 13-19
const TEMPLATE_TOTAL_ROW = 20;

// Inserts `extra` rows above the template's hours TOTAL row, styled like the
// last day row, and shifts every merged range below down with them (the
// Excel library moves cell values/styles but not merges).
function insertDayRows(ws: ExcelJS.Worksheet, extra: number) {
  if (extra <= 0) return;
  const at = TEMPLATE_TOTAL_ROW;
  const topRow = (range: string) => Number(range.match(/\d+/)![0]);
  const below = [...ws.model.merges].filter((m) => topRow(m) >= at);
  for (const m of below) ws.unMergeCells(m);
  ws.spliceRows(at, 0, ...Array.from({ length: extra }, () => []));
  const shift = (range: string) => range.replace(/([A-Z]+)(\d+)/g, (_, c: string, n: string) => `${c}${Number(n) + extra}`);
  for (const m of below) ws.mergeCells(shift(m));

  const style = ws.getRow(at - 1);
  for (let r = at; r < at + extra; r++) {
    const row = ws.getRow(r);
    row.height = style.height;
    style.eachCell({ includeEmpty: true }, (cell, col) => {
      row.getCell(col).style = { ...cell.style };
    });
    ws.mergeCells(`E${r}:F${r}`);
    ws.mergeCells(`G${r}:H${r}`);
    ws.mergeCells(`I${r}:M${r}`);
  }
  // Keep the whole report on one printed page.
  const area = ws.pageSetup.printArea;
  if (area) ws.pageSetup.printArea = area.replace(/:([A-Z]+)(\d+)$/, (_, c: string, n: string) => `:${c}${Number(n) + extra}`);
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 1;
}

// Fills the original template (sheet layout, logo, print setup kept).
// Formulas are rewritten with fresh cached results so previews that don't
// recalculate (email, phones) still show the right numbers.
export async function buildTimesheetXlsx(t: TimesheetExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const ws = wb.worksheets[0];
  ws.name = "Timesheet";
  const tot = timesheetTotals(t);
  const f = (formula: string, result: number | Date) => ({ formula, result }) as ExcelJS.CellFormulaValue;
  const set = (addr: string, v: ExcelJS.CellValue) => {
    ws.getCell(addr).value = v;
  };
  const money = '"$"#,##0.00';

  // Split days need more hours rows than the template's seven.
  const extra = Math.max(0, t.lines.length - TEMPLATE_DAY_ROWS);
  insertDayRows(ws, extra);
  const R = (templateRow: number) => (templateRow >= TEMPLATE_TOTAL_ROW ? templateRow + extra : templateRow);
  const firstLine = 13;
  const lastLine = firstLine + t.lines.length - 1;
  const totalRow = R(20);

  set("E7", t.clientName ?? "");
  set("S7", t.employeeName);
  set("E9", t.location ?? "");
  set("O9", t.jobNumber ?? "");
  set("S9", t.weekEnding);
  set("E12", "FER JOB #");

  const hourFmt = Object.fromEntries(
    ["N", "O", "P", "Q", "R", "S", "T", "U"].map((c) => [c, ws.getCell(`${c}13`).numFmt]),
  );
  const dayFmt = ws.getCell("D13").numFmt;
  t.lines.forEach((l, i) => {
    const r = firstLine + i;
    set(`C${r}`, l.first ? DAY_LABELS[l.dayIndex] : `${DAY_LABELS[l.dayIndex]} (split)`);
    set(`D${r}`, l.date);
    if (dayFmt) ws.getCell(`D${r}`).numFmt = dayFmt;
    set(`E${r}`, lineJobNumber(t, l) || null);
    set(`G${r}`, l.woNumber ?? null);
    set(`I${r}`, l.details ?? null);
    set(`N${r}`, l.stHours);
    set(`O${r}`, l.otHours);
    set(`P${r}`, l.ptoHours);
    set(`Q${r}`, l.vacationHours);
    set(`R${r}`, l.holidayHours);
    set(`S${r}`, l.perDiem);
    set(`T${r}`, l.mileageDriven);
    set(`U${r}`, l.mileageAmount);
    set(`V${r}`, f(`S${r}+U${r}`, (l.perDiem ?? 0) + (l.mileageAmount ?? 0)));
    if (!ws.getCell(`V${r}`).numFmt) ws.getCell(`V${r}`).numFmt = money;
    // The template formats some later rows inconsistently -- use Monday's.
    for (const [c, fmt] of Object.entries(hourFmt)) if (fmt) ws.getCell(`${c}${r}`).numFmt = fmt;
  });

  t.days.forEach((d, i) => {
    const er = R(32) + i;
    set(`D${er}`, d.date);
    if (dayFmt) ws.getCell(`D${er}`).numFmt = dayFmt;
    set(`E${er}`, d.lodging);
    set(`F${er}`, d.meals);
    set(`G${er}`, d.airfare);
    set(`H${er}`, d.fuel);
    set(`I${er}`, d.carRental);
    set(`J${er}`, d.gasoline);
    set(`K${er}`, d.parking);
    set(`L${er}`, d.misc);
    set(`M${er}`, d.expenseDescription ?? null);
  });

  const hourCols: [string, number][] = [
    ["N", tot.hours.stHours],
    ["O", tot.hours.otHours],
    ["P", tot.hours.ptoHours],
    ["Q", tot.hours.vacationHours],
    ["R", tot.hours.holidayHours],
    ["S", tot.perDiem],
    ["T", tot.mileageDriven],
    ["U", tot.mileageAmount],
  ];
  for (const [c, v] of hourCols) set(`${c}${totalRow}`, f(`SUM(${c}${firstLine}:${c}${lastLine})`, v));
  set(`V${totalRow}`, f(`S${totalRow}+U${totalRow}`, tot.weekDollars));

  const expTotalRow = R(39);
  const expCols: [string, number][] = [
    ["E", tot.expenses.lodging],
    ["F", tot.expenses.meals],
    ["G", tot.expenses.airfare],
    ["H", tot.expenses.fuel],
    ["I", tot.expenses.carRental],
    ["J", tot.expenses.gasoline],
    ["K", tot.expenses.parking],
    ["L", tot.expenses.misc],
  ];
  for (const [c, v] of expCols) {
    set(`${c}${expTotalRow}`, f(`SUM(${c}${R(32)}:${c}${R(38)})`, v));
    if (!ws.getCell(`${c}${expTotalRow}`).numFmt) ws.getCell(`${c}${expTotalRow}`).numFmt = money;
  }

  set(`D${R(21)}`, t.notes ?? "");
  const expSum = expCols.map(([c]) => `${c}${expTotalRow}`).join("+");
  set(`V${R(22)}`, f(`V${totalRow}+${expSum}`, tot.totalEmployeeExpenses));
  set(`V${R(24)}`, t.advancedToEmployee);
  set(`V${R(26)}`, f(`V${R(22)}-V${R(24)}`, tot.amountDue));
  const signDate = new Date(t.weekEnding.getTime() + 86400000);
  set(`V${R(48)}`, signDate);
  if (dayFmt) ws.getCell(`V${R(48)}`).numFmt = dayFmt;

  wb.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- PDF

const PW = 792; // Letter, landscape
const PH = 612;
const M = 28;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.851, 0.851, 0.851);
const DARK = rgb(0.25, 0.25, 0.25);

type Col = { label: string; w: number; align?: "left" | "right" | "center" };

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let s = clean(text).replace(/\n/g, " ");
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
  return `${s}...`;
}

function num(v: number | null | undefined): string {
  if (v == null) return "";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}
function usd(v: number | null | undefined): string {
  return v == null ? "" : `$${v.toFixed(2)}`;
}

export async function buildTimesheetPdf(t: TimesheetExport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Time & Expense Report - ${t.employeeName} - WE ${dateOnly(t.weekEnding)}`);
  let page = pdf.addPage([PW, PH]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(FER_LOGO_PNG_BASE64, "base64"));
  const tot = timesheetTotals(t);

  // y is measured from the top of the page.
  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont = font, color = BLACK) =>
    p.drawText(clean(s), { x, y: PH - y, size, font: f, color });
  const box = (x: number, y: number, w: number, h: number, fill?: typeof GRAY) =>
    page.drawRectangle({ x, y: PH - y - h, width: w, height: h, borderColor: BLACK, borderWidth: 0.6, color: fill });

  // Header: logo + title
  const logoH = 34;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: M, y: PH - M - logoH, width: logoW, height: logoH });
  const title = "TIME & EXPENSE REPORT";
  text(page, title, (PW - bold.widthOfTextAtSize(title, 16)) / 2, M + 22, 16, bold);

  // Header fields
  let y = M + logoH + 12;
  const field = (label: string, value: string, x: number, w: number) => {
    text(page, label, x, y + 11, 8.5, bold);
    const lw = bold.widthOfTextAtSize(label, 8.5) + 6;
    text(page, fit(value, font, 9.5, w - lw), x + lw, y + 11, 9.5);
    page.drawLine({ start: { x: x + lw - 2, y: PH - y - 14 }, end: { x: x + w, y: PH - y - 14 }, thickness: 0.5, color: DARK });
  };
  const contentW = PW - 2 * M;
  field("CLIENT NAME:", t.clientName ?? "", M, contentW * 0.45);
  field("EMPLOYEE:", t.employeeName, M + contentW * 0.55, contentW * 0.45);
  y += 20;
  field("LOCATION:", t.location ?? "", M, contentW * 0.3);
  field("FER JOB #:", t.jobNumber ?? "", M + contentW * 0.34, contentW * 0.2);
  field("WEEK ENDING:", dateOnly(t.weekEnding), M + contentW * 0.55, contentW * 0.45);
  y += 28;

  // Split days add rows: shrink the hours table a little so a normal week
  // still fits on one page (expenses move to page 2 if it still doesn't).
  const hoursRowH = t.lines.length <= 7 ? 15 : Math.max(11, Math.floor((15 * 9) / (t.lines.length + 2)));
  const drawTable = (cols: Col[], header: string[], rows: string[][], totalRow: string[], rowH = 15) => {
    const scale = contentW / cols.reduce((s, c) => s + c.w, 0);
    const widths = cols.map((c) => c.w * scale);
    const drawRow = (cells: string[], f: PDFFont, fill?: typeof GRAY, size = rowH < 13 ? 7.5 : 8.5) => {
      let x = M;
      cells.forEach((c, i) => {
        box(x, y, widths[i], rowH, fill);
        const s = fit(c, f, size, widths[i] - 6);
        const w = f.widthOfTextAtSize(s, size);
        const align = fill ? "center" : (cols[i].align ?? "left");
        const tx = align === "right" ? x + widths[i] - 3 - w : align === "center" ? x + (widths[i] - w) / 2 : x + 3;
        text(page, s, tx, y + rowH - 4.5, size, f);
        x += widths[i];
      });
      y += rowH;
    };
    drawRow(header, bold, GRAY, 7.5);
    rows.forEach((r) => drawRow(r, font));
    drawRow(totalRow, bold);
  };

  // Billable time + mileage
  const hourCols: Col[] = [
    { label: "DAY", w: 44 },
    { label: "DATE", w: 52 },
    { label: "FER JOB #", w: 60 },
    { label: "WO #", w: 52 },
    { label: "DETAILS", w: 148 },
    { label: "ST HRS", w: 38, align: "right" },
    { label: "OT HRS", w: 38, align: "right" },
    { label: "PTO", w: 38, align: "right" },
    { label: "VACATION", w: 52, align: "right" },
    { label: "HOLIDAY", w: 40, align: "right" },
    { label: "PER DIEM", w: 46, align: "right" },
    { label: "MILES", w: 38, align: "right" },
    { label: "MILEAGE $", w: 48, align: "right" },
    { label: "TOTAL", w: 50, align: "right" },
  ];
  drawTable(
    hourCols,
    hourCols.map((c) => c.label),
    t.lines.map((d) => [
      d.first ? DAY_LABELS[d.dayIndex] : "  split",
      d.first ? dateOnly(d.date) : "",
      lineJobNumber(t, d),
      d.woNumber ?? "",
      d.details ?? "",
      num(d.stHours),
      num(d.otHours),
      num(d.ptoHours),
      num(d.vacationHours),
      num(d.holidayHours),
      usd(d.perDiem),
      num(d.mileageDriven),
      usd(d.mileageAmount),
      d.perDiem != null || d.mileageAmount != null ? usd((d.perDiem ?? 0) + (d.mileageAmount ?? 0)) : "",
    ]),
    [
      "",
      "",
      "",
      "",
      "TOTAL",
      num(tot.hours.stHours),
      num(tot.hours.otHours),
      num(tot.hours.ptoHours),
      num(tot.hours.vacationHours),
      num(tot.hours.holidayHours),
      usd(tot.perDiem),
      num(tot.mileageDriven),
      usd(tot.mileageAmount),
      usd(tot.weekDollars),
    ],
    hoursRowH,
  );

  // Notes (left) + money summary (right)
  y += 8;
  const summaryW = 230;
  const notesW = contentW - summaryW - 12;
  const top = y;
  text(page, "NOTES:", M, y + 10, 8.5, bold);
  const noteLines = clean(t.notes ?? "").split("\n").flatMap((p) => {
    const out: string[] = [];
    let line = "";
    for (const word of p.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, 8.5) > notesW - 44) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
    return out;
  });
  noteLines.slice(0, 4).forEach((l, i) => text(page, fit(l, font, 8.5, notesW - 44), M + 40, y + 10 + i * 11, 8.5));

  const sx = M + contentW - summaryW;
  const rowH = 15;
  const sumRow = (label: string, value: string, i: number) => {
    const ry = top + i * (rowH + 3);
    page.drawRectangle({ x: sx, y: PH - ry - rowH, width: summaryW - 80, height: rowH, borderColor: BLACK, borderWidth: 0.6, color: GRAY });
    text(page, label, sx + 4, ry + 10.5, 8, bold);
    page.drawRectangle({ x: sx + summaryW - 80, y: PH - ry - rowH, width: 80, height: rowH, borderColor: BLACK, borderWidth: 0.6 });
    const w = bold.widthOfTextAtSize(value, 9);
    text(page, value, sx + summaryW - 3 - w, ry + 10.5, 9, bold);
  };
  sumRow("TOTAL EMPLOYEE EXPENSES", usd(tot.totalEmployeeExpenses), 0);
  sumRow("ADVANCED TO EMPLOYEE", usd(tot.advanced), 1);
  sumRow("AMOUNT DUE TO EMPLOYEE", usd(tot.amountDue), 2);
  y = top + 3 * (rowH + 3) + 8;

  // Expenses (on a second page if split days pushed them off the first)
  if (y + 14 + 9 * 15 + 50 > PH - M) {
    page = pdf.addPage([PW, PH]);
    y = M;
  }
  text(page, "PLEASE LIST EACH CHARGE SEPARATELY WITH DETAILED DESCRIPTION & AMOUNT. ATTACH RECEIPTS SEPARATELY.", M, y + 9, 7.5, bold);
  y += 14;
  const expCols: Col[] = [
    { label: "DAY", w: 34 },
    { label: "DATE", w: 52 },
    { label: "LODGING", w: 50, align: "right" },
    { label: "MEALS", w: 50, align: "right" },
    { label: "AIRFARE", w: 50, align: "right" },
    { label: "FUEL", w: 50, align: "right" },
    { label: "CAR RENT", w: 50, align: "right" },
    { label: "GASOLINE", w: 50, align: "right" },
    { label: "PARKING", w: 50, align: "right" },
    { label: "MISC.", w: 50, align: "right" },
    { label: "DESCRIPTION OR ADDITIONAL INFORMATION", w: 245 },
  ];
  drawTable(
    expCols,
    expCols.map((c) => c.label),
    t.days.map((d, i) => [
      DAY_LABELS[i],
      dateOnly(d.date),
      usd(d.lodging),
      usd(d.meals),
      usd(d.airfare),
      usd(d.fuel),
      usd(d.carRental),
      usd(d.gasoline),
      usd(d.parking),
      usd(d.misc),
      d.expenseDescription ?? "",
    ]),
    [
      "TOTAL",
      "",
      usd(tot.expenses.lodging),
      usd(tot.expenses.meals),
      usd(tot.expenses.airfare),
      usd(tot.expenses.fuel),
      usd(tot.expenses.carRental),
      usd(tot.expenses.gasoline),
      usd(tot.expenses.parking),
      usd(tot.expenses.misc),
      "",
    ],
  );

  // Signature lines
  y += 26;
  const sig = (label: string, x: number, w: number, value = "") => {
    text(page, label, x, y, 8.5, bold);
    const lw = bold.widthOfTextAtSize(label, 8.5) + 6;
    if (value) text(page, value, x + lw, y - 1, 9);
    page.drawLine({ start: { x: x + lw - 2, y: PH - y - 3 }, end: { x: x + w, y: PH - y - 3 }, thickness: 0.5, color: DARK });
  };
  sig("CLIENT APPROVAL:", M, contentW * 0.32);
  sig("DATE:", M + contentW * 0.34, contentW * 0.12);
  sig("EMPLOYEE SIGNATURE:", M + contentW * 0.5, contentW * 0.32);
  sig("DATE:", M + contentW * 0.85, contentW * 0.15);

  text(
    page,
    "NOTE: Use a separate time sheet for each job. Generated from the FER portal.",
    M,
    PH - M + 6,
    7,
    font,
    DARK,
  );

  return pdf.save();
}
