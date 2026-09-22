import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, isAssignedProjectLeadOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  MAX_IMPORT_BYTES,
  parseTimesheetImportFile,
  importTimesheetRows,
  type ParsedTimesheetRow,
} from "@/lib/timesheetImport";

export const dynamic = "force-dynamic";

// Bulk-enter timesheet days from a spreadsheet.
//   mode=preview  parse + validate only, nothing is saved
//   mode=import   saves valid rows
// Admin, Super Admin, HR, and Tracks can import for anyone; a Project
// Lead/Manager can only import rows for employees assigned to them --
// rows for anyone else are rejected, not silently dropped.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  const allowedRole = me && (isAdminRole(me.role) || me.role === "HR" || me.role === "TRACKS" || me.role === "PROJECT_LEAD" || me.role === "PROJECT_MANAGER");
  if (!me || !allowedRole) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an .xlsx or .csv file." }, { status: 400 });
  }
  if (!/\.(xlsx|csv)$/i.test(file.name)) {
    return Response.json({ error: "Only .xlsx and .csv files are supported." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return Response.json({ error: "File is larger than 5 MB." }, { status: 400 });
  }

  let rows: ParsedTimesheetRow[];
  try {
    rows = await parseTimesheetImportFile({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not read the file." }, { status: 400 });
  }

  // A Project Lead/Manager may only bring in rows for their own employees.
  if (!isAdminRole(me.role) && me.role !== "HR" && me.role !== "TRACKS") {
    const employeeIds = [...new Set(rows.map((r) => r.employeeId).filter((x): x is string => !!x))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, projectLeadEmail: true, projectManagerEmail: true, createdById: true },
    });
    const allowedIds = new Set(employees.filter((e) => isAssignedProjectLeadOrManager(me, e)).map((e) => e.id));
    for (const r of rows) {
      if (r.employeeId && !allowedIds.has(r.employeeId)) {
        r.errors.push("Not one of your assigned employees");
      }
    }
  }

  const invalid = rows.filter((r) => r.errors.length > 0);
  const importable = rows.filter((r) => r.errors.length === 0);

  if (mode === "import") {
    const imported = await importTimesheetRows(importable);
    revalidatePath("/admin/timesheets");
    return Response.json({ imported, skipped: invalid.length });
  }

  return Response.json({
    total: rows.length,
    willImport: importable.length,
    invalid: invalid.length,
    sample: importable.slice(0, 8).map((r) => ({
      row: r.row,
      email: r.record.employeeEmail,
      date: r.record.date ? r.record.date.toISOString().slice(0, 10) : null,
      jobNumber: r.record.jobNumber,
      stHours: r.record.stHours,
    })),
    issues: invalid
      .map((r) => ({ row: r.row, email: r.record.employeeEmail, message: r.errors.join("; ") }))
      .slice(0, 50),
  });
}
