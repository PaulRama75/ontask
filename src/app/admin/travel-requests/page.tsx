import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { scopedEmployeeIds } from "@/lib/timesheetReport";
import { parseIsoDate } from "@/lib/timesheetWeek";

export const dynamic = "force-dynamic";

const cardClass =
  "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
const inputCls =
  "h-8 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40 [color-scheme:dark]";
const labelCls = "flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400";
const chip =
  "flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] uppercase tracking-wider text-slate-400";
const chipNum = "text-base font-bold normal-case tabular-nums text-white";
const theadCls =
  "sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]";
const th = "whitespace-nowrap px-3 py-2 text-left";
const td = "whitespace-nowrap px-3 py-1.5 align-middle tabular-nums text-slate-300";
// Dark, thin scrollbars so the table doesn't show a white browser scrollbar.
const scrollCls =
  "overflow-auto [color-scheme:dark] [scrollbar-width:thin] [scrollbar-color:rgba(56,189,248,0.35)_#0a1426]";
const dash = <span className="text-slate-600">—</span>;

function d(v: Date | null): ReactNode {
  return v ? v.toISOString().slice(0, 10) : dash;
}
function yn(v: boolean | null): ReactNode {
  if (v == null) return dash;
  return v ? (
    <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
      Yes
    </span>
  ) : (
    <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-slate-400">No</span>
  );
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

  // Header chip counts (display only, from the rows already loaded).
  const todayIso = new Date().toISOString().slice(0, 10);
  const flights = rows.filter((r) => r.flightNeeded).length;
  const cars = rows.filter((r) => r.rentalCarNeeded).length;
  const upcoming = rows.filter((r) => r.dateOfDeparture && r.dateOfDeparture.toISOString().slice(0, 10) >= todayIso).length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-3">
      {/* Header: title, stat chips, actions + filter bar */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path
                  d="M2.5 11.5l15-6-4.5 11-2.5-4.5-4.5-.5h-3.5z M10.5 12l7-6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Travel Requests</h1>
              <p className="text-[11px] text-slate-400">
                Every submitted travel request. Each one was also emailed to the Travel Administrator as a PDF.
                {scope && " Showing only employees assigned to you."}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
              Requests <span className={chipNum}>{rows.length}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow shadow-sky-400/60" />
              Flights <span className={chipNum}>{flights}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
              Rental cars <span className={chipNum}>{cars}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
              Upcoming <span className={chipNum}>{upcoming}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
            >
              ← Admin home
            </Link>
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-2.5 border-t border-white/[0.06] px-3 py-2.5">
          <label className={`${labelCls} min-w-[220px] flex-1`}>
            Search
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, job #, client, location…"
              className={`${inputCls} w-full`}
            />
          </label>
          <label className={labelCls}>
            Departing from
            <input type="date" name="from" defaultValue={fromRaw ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            Departing to
            <input type="date" name="to" defaultValue={toRaw ?? ""} className={inputCls} />
          </label>
          <button
            type="submit"
            className="flex h-8 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500"
          >
            Apply
          </button>
          <a
            href="/admin/travel-requests"
            className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
          >
            Clear
          </a>
        </form>
      </section>

      {/* Requests table */}
      <section className={`mt-3 overflow-hidden ${cardClass}`}>
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">All requests</h2>
          <span className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-[11px] text-sky-200">
            {rows.length} request{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className={`max-h-[calc(100vh-260px)] min-h-[220px] ${scrollCls}`}>
          <table className="w-full text-left text-[13px]">
            <thead className={theadCls}>
              <tr>
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
                  <td colSpan={17} className="px-4 py-8 text-center text-sm text-slate-500">
                    No travel requests match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const emp = [r.employee.firstName, r.employee.lastName].filter(Boolean).join(" ") || "—";
                return (
                  <tr key={r.id} className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]">
                    <td className={`${td} text-slate-400`}>{d(r.createdAt)}</td>
                    <td className={td}>
                      <Link
                        href={`/admin/employee/${r.employee.id}`}
                        className="font-semibold text-sky-300 hover:text-sky-200 hover:underline"
                      >
                        {emp}
                      </Link>
                    </td>
                    <td className={`${td} text-white`}>{r.fullName ?? dash}</td>
                    <td className={`${td} font-mono text-xs`}>{r.jobNumber ?? dash}</td>
                    <td className={td}>{r.clientName ?? dash}</td>
                    <td className={td}>{yn(r.flightNeeded)}</td>
                    <td className={td}>{r.travelType ?? dash}</td>
                    <td className={`${td} text-white`}>{d(r.dateOfDeparture)}</td>
                    <td className={td}>{d(r.dateOfReturn)}</td>
                    <td className={td}>{r.departureLocation ?? dash}</td>
                    <td className={td}>{r.destinationLocation ?? dash}</td>
                    <td className={td}>{yn(r.rentalCarNeeded)}</td>
                    <td className={td}>{d(r.dateOfPickup)}</td>
                    <td className={td}>{d(r.dateOfCarReturn)}</td>
                    <td className={`${td} text-slate-400`}>{r.billingManagerEmail ?? dash}</td>
                    <td className={td}>{r.submittedByName}</td>
                    <td className={td}>
                      <a
                        href={`/api/travel-requests/${r.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-6 items-center rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-400/15"
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
    </main>
  );
}
