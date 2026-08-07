import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";

// Serves an uploaded document. Phase 2 will gate this behind role-based auth.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });

  const file = await getFile(doc.storageKey);
  if (!file) return new Response("File missing", { status: 404 });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    },
  });
}
