import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canView } from "@/lib/rbac";

// Zips just one employee's uploaded documents -- same "library" permission
// as the all-employees export, and as opening that employee's document
// library page.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const access = await getAccessMap(me.role);
  if (!canView(access, "library")) return new Response("Forbidden", { status: 403 });

  const { employeeId } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { firstName: true, lastName: true },
  });
  if (!employee) return new Response("Not found", { status: 404 });

  const documents = await prisma.document.findMany({
    where: { employeeId },
    orderBy: { createdAt: "asc" },
  });
  if (documents.length === 0) return new Response("No documents", { status: 404 });

  const zip = new JSZip();
  for (const doc of documents) {
    const file = await getFile(doc.storageKey);
    if (!file) continue;
    const label = doc.label ? `${slug(doc.label, "")}-` : "";
    zip.file(`${slug(doc.category, "DOC")}-${label}${doc.fileName}`, file.buffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const name = slug([employee.firstName, employee.lastName].filter(Boolean).join(" "), employeeId);
  const fileName = `${name}-documents-${new Date().toISOString().slice(0, 10)}.zip`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function slug(input: string, fallback: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return s.length ? s : fallback;
}
