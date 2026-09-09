import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canView } from "@/lib/rbac";

// Bundles every uploaded document, for every employee, into one zip file —
// gated by the same "library" permission that gates opening an individual
// employee's document library (full PII + all uploaded documents).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const access = await getAccessMap(me.role);
  if (!canView(access, "library")) return new Response("Forbidden", { status: 403 });

  const documents = await prisma.document.findMany({
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const zip = new JSZip();
  for (const doc of documents) {
    const file = await getFile(doc.storageKey);
    if (!file) continue;
    const folder = slug(
      [doc.employee.firstName, doc.employee.lastName].filter(Boolean).join(" "),
      doc.employeeId,
    );
    const label = doc.label ? `${slug(doc.label, "")}-` : "";
    zip.file(`${folder}/${slug(doc.category, "DOC")}-${label}${doc.fileName}`, file.buffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const fileName = `documents-export-${new Date().toISOString().slice(0, 10)}.zip`;

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
