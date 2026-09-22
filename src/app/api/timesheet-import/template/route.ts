import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { IMPORT_COLUMNS } from "@/lib/timesheetImport";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  const allowed = me && (isAdminRole(me.role) || me.role === "HR" || me.role === "TRACKS" || me.role === "PROJECT_LEAD" || me.role === "PROJECT_MANAGER");
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Timesheets");
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRow({
    employeeEmail: "jane.example@example.com",
    date: "2026-09-22",
    clientName: "Demo Client Co.",
    location: "Refinery Site A",
    jobNumber: "26-1234-001",
    stHours: 8,
    otHours: 0,
  });

  const notes = wb.addWorksheet("Notes");
  [
    "Delete the example row before uploading.",
    "Employee Email and Date are required on every row; everything else is optional.",
    "One row = one employee's one day. A full week is 7 rows for that employee.",
    "Dates: YYYY-MM-DD or MM/DD/YYYY.",
    "Client Name / Location / Job Number / Advanced To Employee apply to the whole week -- the last row imported for that employee+week wins.",
    "A Project Lead/Manager can only import rows for employees assigned to them.",
  ].forEach((t) => notes.addRow([t]));
  notes.getColumn(1).width = 100;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="timesheet-import-template.xlsx"',
    },
  });
}
