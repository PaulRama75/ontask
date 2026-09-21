import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import {
  MAX_IMPORT_BYTES,
  parseImportFile,
  flagDuplicates,
  importRows,
} from "@/lib/employeeImport";

export const dynamic = "force-dynamic";

// Upload a spreadsheet of previous employees.
//   mode=preview  parse + validate only, nothing is saved
//   mode=import   save valid rows (rows that look like duplicates are skipped
//                 unless allowDuplicates=1)
// Admin, Super Admin and HR only.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !(isAdminRole(me.role) || me.role === "HR")) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "import" ? "import" : "preview";
  const allowDuplicates = form.get("allowDuplicates") === "1";
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose an .xlsx or .csv file." }, { status: 400 });
  }
  if (!/\.(xlsx|csv)$/i.test(file.name)) {
    return Response.json({ error: "Only .xlsx and .csv files are supported." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return Response.json({ error: "File is larger than 5 MB." }, { status: 400 });
  }

  let rows;
  try {
    rows = await parseImportFile({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not read the file." }, { status: 400 });
  }
  await flagDuplicates(rows);

  const invalid = rows.filter((r) => r.errors.length > 0);
  const duplicates = rows.filter((r) => r.errors.length === 0 && r.duplicateOf);
  const importable = rows.filter((r) => r.errors.length === 0 && (allowDuplicates || !r.duplicateOf));

  if (mode === "import") {
    const created = await importRows(importable, me.id);
    revalidatePath("/admin");
    revalidatePath("/admin/grid");
    return Response.json({ imported: created, skippedInvalid: invalid.length, skippedDuplicates: allowDuplicates ? 0 : duplicates.length });
  }

  const name = (r: (typeof rows)[number]) => [r.record.firstName, r.record.lastName].filter(Boolean).join(" ") || "(no name)";
  return Response.json({
    total: rows.length,
    willImport: importable.length,
    invalid: invalid.length,
    duplicates: duplicates.length,
    sample: importable.slice(0, 8).map((r) => ({
      row: r.row,
      name: name(r),
      email: r.record.email,
      site: r.record.site,
      hireDate: r.record.hireDate ? r.record.hireDate.toISOString().slice(0, 10) : null,
    })),
    issues: [
      ...invalid.map((r) => ({ row: r.row, name: name(r), message: r.errors.join("; ") })),
      ...duplicates.map((r) => ({ row: r.row, name: name(r), message: `Looks like a duplicate of ${r.duplicateOf}` })),
    ]
      .sort((a, b) => a.row - b.row)
      .slice(0, 50),
  });
}
