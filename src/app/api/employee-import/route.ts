import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { MAX_IMPORT_BYTES, parseImportFile, classifyRows, applyImport } from "@/lib/employeeImport";

export const dynamic = "force-dynamic";

// Upload the employee spreadsheet. Each row is matched to existing employees
// by email and sorted into update / new / unchanged / skip.
//   mode=preview  parse + classify only, nothing is saved
//   mode=import   apply: update=1 updates matched employees, create=1 adds
//                 new ones; allowNameMatches=1 also adds people whose name is
//                 already on file under a different email
// Admin, Super Admin and HR only.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !(isAdminRole(me.role) || me.role === "HR")) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  const update = form.get("update") !== "0";
  const create = form.get("create") !== "0";
  const allowNameMatches = form.get("allowNameMatches") === "1";
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an .xlsx or .csv file." }, { status: 400 });
  }
  if (!/\.(xlsx|csv)$/i.test(file.name)) {
    return Response.json({ error: "Only .xlsx and .csv files are supported." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return Response.json({ error: "File is larger than 5 MB." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseImportFile({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not read the file." }, { status: 400 });
  }
  const rows = await classifyRows(parsed.rows, { allowNameMatches });
  const of = (a: string) => rows.filter((r) => r.action === a);
  const counts = { update: of("update").length, new: of("new").length, unchanged: of("unchanged").length, skip: of("skip").length };

  if (mode === "import") {
    const result = await applyImport(rows, { update, create, createdById: me.id });
    revalidatePath("/admin");
    revalidatePath("/admin/grid");
    return Response.json({ ...result, unchanged: counts.unchanged, skipped: counts.skip });
  }

  const name = (r: (typeof rows)[number]) => [r.record.firstName, r.record.lastName].filter(Boolean).join(" ") || "(no name)";
  return Response.json({
    total: rows.length,
    columns: parsed.columns,
    counts,
    updates: of("update")
      .slice(0, 20)
      .map((r) => ({ row: r.row, name: name(r), email: r.record.email, changes: r.changes })),
    newRows: of("new")
      .slice(0, 8)
      .map((r) => ({
        row: r.row,
        name: name(r),
        email: r.record.email,
        site: r.record.site,
        hireDate: r.record.hireDate ? r.record.hireDate.toISOString().slice(0, 10) : null,
      })),
    issues: of("skip")
      .slice(0, 50)
      .map((r) => ({ row: r.row, name: name(r), message: r.reason ?? "Skipped" })),
  });
}
