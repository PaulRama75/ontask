import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { IMPORT_COLUMNS } from "@/lib/employeeImport";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !(isAdminRole(me.role) || me.role === "HR")) {
    return new Response("Forbidden", { status: 403 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Employees");
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRow({
    firstName: "Jane",
    lastName: "Example",
    email: "jane.example@example.com",
    phone: "555-010-2000",
    addressLine1: "123 Main St",
    city: "Houston",
    state: "TX",
    zip: "77001",
    site: "Refinery Site A",
    hireDate: "2021-03-15",
    payRate: 24.5,
    billRate: 41,
    projectLeadEmail: "lead@ferinspection.com",
    active: "Yes",
  });

  const notes = wb.addWorksheet("Notes");
  [
    "Delete the example row before uploading.",
    "Only First Name or Last Name is required; every other column is optional.",
    "Dates: YYYY-MM-DD or MM/DD/YYYY. Rates: plain numbers ($ and commas are fine).",
    "Active: Yes or No (blank means Yes).",
    "Imported employees are created as Approved. No onboarding link and no emails are sent.",
    "Rows matching an existing employee's email or full name are skipped as duplicates unless you choose to import them.",
  ].forEach((t) => notes.addRow([t]));
  notes.getColumn(1).width = 110;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="employee-import-template.xlsx"',
    },
  });
}
