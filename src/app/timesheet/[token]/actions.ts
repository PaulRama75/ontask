"use server";

import { prisma } from "@/lib/prisma";
import { weekDates, parseIsoDate, isoDate } from "@/lib/timesheetWeek";
import { redirect } from "next/navigation";

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
