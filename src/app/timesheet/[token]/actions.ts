"use server";

import { prisma } from "@/lib/prisma";
import { weekDates, parseIsoDate, isoDate } from "@/lib/timesheetWeek";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { sendEmail } from "@/lib/email";
import { dateOnly } from "@/lib/formPdf";
import {
  loadTimesheetExport,
  buildTimesheetXlsx,
  buildTimesheetPdf,
  timesheetFileBase,
  timesheetTotals,
} from "@/lib/timesheetExport";

// The link is public (no login), so cap how many emails one link can send.
const EMAILS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const num = (form: FormData, key: string): number | null => {
  const v = form.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (form: FormData, key: string): string | null => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

// The employee's own weekly entry. Token-gated only -- no login. Every
// field maps 1:1 onto the source Time & Expense Report template.
export async function saveTimesheet(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  const weekEndingStr = String(form.get("weekEnding") ?? "");
  const weekEnding = parseIsoDate(weekEndingStr);
  if (!weekEnding) throw new Error("Invalid week.");

  const link = await prisma.employeeTimesheetToken.findUnique({ where: { token } });
  if (!link || link.revokedAt) throw new Error("This link is no longer valid.");

  const days = weekDates(weekEnding);

  await prisma.$transaction(async (tx) => {
    const ts = await tx.timesheet.upsert({
      where: { employeeId_weekEnding: { employeeId: link.employeeId, weekEnding } },
      update: {
        clientName: str(form, "clientName"),
        location: str(form, "location"),
        jobNumber: str(form, "jobNumber"),
        notes: str(form, "notes"),
        advancedToEmployee: num(form, "advancedToEmployee"),
        employeeSignedAt: new Date(),
      },
      create: {
        employeeId: link.employeeId,
        weekEnding,
        clientName: str(form, "clientName"),
        location: str(form, "location"),
        jobNumber: str(form, "jobNumber"),
        notes: str(form, "notes"),
        advancedToEmployee: num(form, "advancedToEmployee"),
        employeeSignedAt: new Date(),
      },
    });

    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      const data = {
        jobNumber: str(form, `jobNumber_${i}`),
        afeNumber: str(form, `afeNumber_${i}`),
        woNumber: str(form, `woNumber_${i}`),
        details: str(form, `details_${i}`),
        stHours: num(form, `stHours_${i}`),
        otHours: num(form, `otHours_${i}`),
        ptoHours: num(form, `ptoHours_${i}`),
        vacationHours: num(form, `vacationHours_${i}`),
        holidayHours: num(form, `holidayHours_${i}`),
        perDiem: num(form, `perDiem_${i}`),
        mileageDriven: num(form, `mileageDriven_${i}`),
        mileageAmount: num(form, `mileageAmount_${i}`),
        lodging: num(form, `lodging_${i}`),
        meals: num(form, `meals_${i}`),
        airfare: num(form, `airfare_${i}`),
        fuel: num(form, `fuel_${i}`),
        carRental: num(form, `carRental_${i}`),
        gasoline: num(form, `gasoline_${i}`),
        parking: num(form, `parking_${i}`),
        misc: num(form, `misc_${i}`),
        expenseDescription: str(form, `expenseDescription_${i}`),
      };
      await tx.timesheetDay.upsert({
        where: { timesheetId_date: { timesheetId: ts.id, date } },
        update: data,
        create: { timesheetId: ts.id, date, ...data },
      });
    }
  });

  redirect(`/timesheet/${token}?week=${isoDate(weekEnding)}&saved=1`);
}

// Emails the saved week (Excel + PDF) to any address the employee types --
// e.g. themselves, their supervisor, or the client.
export async function emailTimesheet(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  const weekEndingStr = String(form.get("weekEnding") ?? "");
  const to = String(form.get("to") ?? "").trim();
  const weekEnding = parseIsoDate(weekEndingStr);
  if (!weekEnding) throw new Error("Invalid week.");

  const link = await prisma.employeeTimesheetToken.findUnique({ where: { token } });
  if (!link || link.revokedAt) throw new Error("This link is no longer valid.");

  const back = (status: string) =>
    redirect(`/timesheet/${token}?week=${isoDate(weekEnding)}&email=${status}`);
  if (!EMAIL_RE.test(to) || to.length > 254) back("invalid");

  const prefix = `ts-email:${link.employeeId}:`;
  const recent = await prisma.notificationLog.count({
    where: { key: { startsWith: prefix }, createdAt: { gt: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= EMAILS_PER_HOUR) back("limit");

  const data = await loadTimesheetExport(link.employeeId, weekEnding);
  const [xlsx, pdf] = await Promise.all([buildTimesheetXlsx(data), buildTimesheetPdf(data)]);
  const base = timesheetFileBase(data);
  const tot = timesheetTotals(data);
  const hours = Object.values(tot.hours).reduce((s, v) => s + v, 0);

  await prisma.notificationLog.create({ data: { key: `${prefix}${Date.now()}:${randomUUID()}` } });
  const ok = await sendEmail({
    to,
    subject: `Time & Expense Report - ${data.employeeName} - WE ${dateOnly(weekEnding)}`,
    html: `<p>Attached is the Time &amp; Expense Report for <strong>${escapeHtml(data.employeeName)}</strong>, week ending ${dateOnly(weekEnding)}${data.clientName ? ` (${escapeHtml(data.clientName)})` : ""}.</p>
<p>Total hours: ${hours} &middot; Amount due to employee: $${tot.amountDue.toFixed(2)}</p>
<p style="font-size:12px;color:#94a3b8;">Sent from the FER timesheet portal.</p>`,
    attachments: [
      { filename: `${base}.xlsx`, content: xlsx.toString("base64") },
      { filename: `${base}.pdf`, content: Buffer.from(pdf).toString("base64") },
    ],
  });
  back(ok ? "sent" : "failed");
}
