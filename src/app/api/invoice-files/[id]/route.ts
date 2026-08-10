import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";

// Serves an invoice attachment. Unlike /api/files/[id] (employee documents,
// currently unauthenticated), this route checks the caller's role/ownership
// since invoice attachments (timesheets, client info) are more sensitive.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = await prisma.invoiceAttachment.findUnique({
    where: { id },
    include: { invoice: true },
  });
  if (!att) return new Response("Not found", { status: 404 });

  const allowed =
    isAdminRole(me.role) || me.role === "ACCOUNT_MANAGER" || att.invoice.createdByUserId === me.id;
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const file = await getFile(att.storageKey);
  if (!file) return new Response("File missing", { status: 404 });

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(att.fileName)}"`,
    },
  });
}
