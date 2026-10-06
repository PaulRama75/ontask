import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { scopedEmployeeIds } from "@/lib/timesheetReport";
import { parseIsoDate } from "@/lib/timesheetWeek";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-white/10 bg-slate-800/60 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400";
const th = "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap";
const td = "px-2 py-1.5 text-slate-200 whitespace-nowrap";

function d(v: Date | null): string {
  return v ? v.toISOString().slice(0, 10) : "—";
}
function yn(v: boolean | null): string {
  return v == null ? "—" : v ? "Yes" : "No";
}

export default async function TravelRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; from?: string; to?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.travel) redirect(firstAllowedNavHref(nav));

  const { q: qRaw, from: fromRaw, to: toRaw } = await searchParams;
  const q = qRaw?.trim() || "";
  const from = fromRaw ? (parseIsoDate(fromRaw) ?? undefined) : undefined;
  const to = toRaw ? (parseIsoDate(toRaw) ?? undefined) : undefined;

  // Project Leads/Managers only see requests for employees assigned to them.
  const scope = await scopedEmployeeIds(me);

  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.TravelRequestWhereInput = {
    ...(scope ? { employeeId: { in: scope } } : {}),
    ...(from || to ? { dateOfDeparture: { gte: from, lte: to } } : {}),
    ...(q
      ? {
          OR: [
            { fullName: contains },
            { jobNumber: contains },
            { clientName: contains },
            { departureLocation: contains },
            { destinationLocation: contains },
            { submittedByName: contains },
            { employee: { firstName: contains } },
            { employee: { lastName: contains } },
          ],
        }
      : {}),
  };

  const rows = await prisma.travelRequest.findMany({
    where,
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Travel Requests</h1>
            <p className="text-sm text-slate-400">
              Every submitted travel request. Each one was also emailed to the Travel Administrator as a PDF.
              {scope && " Showing only employees assigned to you."}
            </p>
          </div>
          <Link href="/admin" className="text-sm text-cyan-400 hover:underline">
            ← Admin home
          </Link>
        </div>

        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-slate-900/60 p-4 shadow-lg shadow-black/30 backdrop-blur">
          <label className="text-xs text-slate-400">
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, job #, client, location…"
              className={`${inputCls} mt-1 block w-72`}
            />
          </label>
          <label className="text-xs text-slate-400">
            Departing from
            <input type="date" name="from" defaultValue={fromRaw ?? ""} className={`${inputCls} mt-1 block`} />
          </label>
          <label className="text-xs text-slate-400">
            Departing to
            <input type="date" name="to" defaultValue={toRaw ?? ""} className={`${inputCls} mt-1 block`} />
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500">
            Apply
          </button>
          <a href="/admin/travel-requests" className="text-xs text-slate-400 hover:underline">
            Clear
          </a>
          <span className="ml-auto text-xs text-slate-500">
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </span>
        </form>

        <section className="rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-white/10">
                  <th className={th}>Submitted</th>
                  <th className={th}>Employee</th>
                  <th className={th}>Traveler</th>
                  <th className={th}>Job #</th>
                  <th className={th}>Client</th>
                  <th className={th}>Flight</th>
                  <th className={th}>Travel Type</th>
                  <th className={th}>Depart</th>
                  <th className={th}>Return</th>
                  <th className={th}>From</th>
                  <th className={th}>To</th>
                  <th className={th}>Rental Car</th>
                  <th className={th}>Car Pickup</th>
                  <th className={th}>Car Return</th>
                  <th className={th}>Billing Manager</th>
                  <th className={th}>Submitted By</th>
                  <th className={th}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={17} className="px-4 py-8 text-center text-slate-500">
                      No travel requests match these filters.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const emp = [r.employee.firstName, r.employee.lastName].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={r.id} className="border-b border-white/5">
                      <td className={td}>{d(r.createdAt)}</td>
                      <td className={td}>
                        <Link href={`/admin/employee/${r.employee.id}`} className="text-cyan-400 hover:underline">
                          {emp}
                        </Link>
                      </td>
                      <td className={td}>{r.fullName ?? "—"}</td>
                      <td className={td}>{r.jobNumber ?? "—"}</td>
                      <td className={td}>{r.clientName ?? "—"}</td>
                      <td className={td}>{yn(r.flightNeeded)}</td>
                      <td className={td}>{r.travelType ?? "—"}</td>
                      <td className={td}>{d(r.dateOfDeparture)}</td>
                      <td className={td}>{d(r.dateOfReturn)}</td>
                      <td className={td}>{r.departureLocation ?? "—"}</td>
                      <td className={td}>{r.destinationLocation ?? "—"}</td>
                      <td className={td}>{yn(r.rentalCarNeeded)}</td>
                      <td className={td}>{d(r.dateOfPickup)}</td>
                      <td className={td}>{d(r.dateOfCarReturn)}</td>
                      <td className={td}>{r.billingManagerEmail ?? "—"}</td>
                      <td className={td}>{r.submittedByName}</td>
                      <td className={td}>
                        <a
                          href={`/api/travel-requests/${r.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:underline"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
