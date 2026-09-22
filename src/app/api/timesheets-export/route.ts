import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess } from "@/lib/rbac";
import { fetchTimesheetDays } from "@/lib/timesheetReport";
import { isoDate, parseIsoDate } from "@/lib/timesheetWeek";

export const dynamic = "force-dynamic";

// Exports the exact same filtered rows the report page is showing --
// same access scope, same employee/date/job-number filters (read from the
// same query params).
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const nav = await getNavAccess(me.role);
  if (!nav.timesheets) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const employeeId = url.searchParams.get("employeeId") || undefined;
  const jobNumbers = url.searchParams.get("jobNumbers")?.split(",").map((s) => s.trim()).filter(Boolean);
  const from = url.searchParams.get("from") ? (parseIsoDate(url.searchParams.get("from")!) ?? undefined) : undefined;
  const to = url.searchParams.get("to") ? (parseIsoDate(url.searchParams.get("to")!) ?? undefined) : undefined;

  const rows = await fetchTimesheetDays(me, { employeeId, jobNumbers, from, to });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Timesheet Detail");
  ws.columns = [
    { header: "Employee", key: "employee", width: 22 },
    { header: "Date", key: "date", width: 12 },
    { header: "Week Ending", key: "weekEnding", width: 12 },
    { header: "Client", key: "client", width: 18 },
    { header: "Location", key: "location", width: 16 },
    { header: "Job Number", key: "jobNumber", width: 14 },
    { header: "AFE #", key: "afe", width: 10 },
    { header: "WO #", key: "wo", width: 10 },
    { header: "Details", key: "details", width: 24 },
    { header: "ST Hours", key: "st", width: 10 },
    { header: "OT Hours", key: "ot", width: 10 },
    { header: "PTO", key: "pto", width: 8 },
    { header: "Vacation", key: "vac", width: 10 },
    { header: "Holiday", key: "hol", width: 10 },
    { header: "Per Diem", key: "perDiem", width: 10 },
    { header: "Miles", key: "miles", width: 8 },
    { header: "Mileage $", key: "mileageAmt", width: 10 },
    { header: "Lodging", key: "lodging", width: 10 },
    { header: "Meals", key: "meals", width: 10 },
    { header: "Airfare", key: "airfare", width: 10 },
    { header: "Fuel", key: "fuel", width: 10 },
    { header: "Car Rental", key: "carRental", width: 10 },
    { header: "Gasoline", key: "gasoline", width: 10 },
    { header: "Parking", key: "parking", width: 10 },
    { header: "Misc", key: "misc", width: 10 },
    { header: "Expense Description", key: "expDesc", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    const emp = r.timesheet.employee;
    ws.addRow({
      employee: [emp.firstName, emp.lastName].filter(Boolean).join(" ") || emp.email,
      date: isoDate(r.date),
      weekEnding: isoDate(r.timesheet.weekEnding),
      client: r.timesheet.clientName,
      location: r.timesheet.location,
      jobNumber: r.jobNumber ?? r.timesheet.jobNumber,
      afe: r.afeNumber,
      wo: r.woNumber,
      details: r.details,
      st: r.stHours,
      ot: r.otHours,
      pto: r.ptoHours,
      vac: r.vacationHours,
      hol: r.holidayHours,
      perDiem: r.perDiem,
      miles: r.mileageDriven,
      mileageAmt: r.mileageAmount,
      lodging: r.lodging,
      meals: r.meals,
      airfare: r.airfare,
      fuel: r.fuel,
      carRental: r.carRental,
      gasoline: r.gasoline,
      parking: r.parking,
      misc: r.misc,
      expDesc: r.expenseDescription,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `timesheets-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
