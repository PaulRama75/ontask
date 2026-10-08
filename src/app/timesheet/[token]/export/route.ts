import { prisma } from "@/lib/prisma";
import { parseIsoDate } from "@/lib/timesheetWeek";
import {
  loadTimesheetExport,
  buildTimesheetXlsx,
  buildTimesheetPdf,
  timesheetFileBase,
} from "@/lib/timesheetExport";

export const dynamic = "force-dynamic";

// Download one saved week as the filled Time & Expense workbook (?format=xlsx)
// or as a PDF (?format=pdf). Token-gated exactly like the timesheet page.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.employeeTimesheetToken.findUnique({ where: { token } });
  if (!link || link.revokedAt) return new Response("Not found", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const weekEnding = parseIsoDate(sp.get("week") ?? "");
  if (!weekEnding || weekEnding.getUTCDay() !== 0) return new Response("Invalid week", { status: 400 });

  const data = await loadTimesheetExport(link.employeeId, weekEnding);
  const base = timesheetFileBase(data);

  if (sp.get("format") === "pdf") {
    const pdf = await buildTimesheetPdf(data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const xlsx = await buildTimesheetXlsx(data);
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
