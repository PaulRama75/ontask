import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess } from "@/lib/rbac";
import { scopedEmployeeIds } from "@/lib/timesheetReport";
import { buildTravelRequestPdf, travelPdfFileName } from "@/lib/travelPdf";
import { fullName } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// Same PDF that's emailed to the Travel Administrator, regenerated on demand
// from the saved record, with the same access scope as the Travel Requests grid.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const nav = await getNavAccess(me.role);
  if (!nav.travel) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const tr = await prisma.travelRequest.findUnique({
    where: { id },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (!tr) return new Response("Not found", { status: 404 });

  const scope = await scopedEmployeeIds(me);
  if (scope && !scope.includes(tr.employeeId)) return new Response("Forbidden", { status: 403 });

  const empName = fullName(tr.employee);
  const pdf = await buildTravelRequestPdf(tr, empName);
  const download = new URL(req.url).searchParams.has("dl");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${travelPdfFileName(tr, empName)}"`,
    },
  });
}
