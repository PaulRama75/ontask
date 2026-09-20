import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { getAccessMap, canAccessEmployeeDocuments, hasEmployeeDocumentGrant } from "@/lib/rbac";

// Serves an uploaded employee document. Same permission as opening the
// employee's document library page and the zip exports -- one gate for
// every way a document can be seen or downloaded.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { employee: { select: { projectLeadEmail: true, projectManagerEmail: true, createdById: true } } },
  });
  if (!doc) return new Response("Not found", { status: 404 });

  const access = await getAccessMap(me.role);
  const granted = await hasEmployeeDocumentGrant(me.id, doc.employeeId);
  if (!canAccessEmployeeDocuments(access, me, doc.employee, granted)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = await getFile(doc.storageKey);
  if (!file) return new Response("File missing", { status: 404 });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    },
  });
}
