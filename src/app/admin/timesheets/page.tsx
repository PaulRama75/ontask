import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { fetchTimesheetDays, scopedEmployeeIds, summarizeByEmployee } from "@/lib/timesheetReport";
import { isoDate, parseIsoDate } from "@/lib/timesheetWeek";
import ImportTimesheets from "./ImportTimesheets";
import PinUnlockLink from "../PinUnlockLink";

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
const dash = <span className="text-slate-600">—</span>;

function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

export default async function TimesheetsReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    employeeId?: string;
    jobNumbers?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.timesheets) redirect(firstAllowedNavHref(nav));

  const { employeeId, jobNumbers: jobNumbersRaw, from: fromRaw, to: toRaw } = await searchParams;
  const jobNumbers = jobNumbersRaw ? jobNumbersRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const from = fromRaw ? (parseIsoDate(fromRaw) ?? undefined) : undefined;
  // Default window (no filters given at all): last 8 weeks, so the page
  // doesn't load the entire table by default.
  const hasAnyFilter = !!(employeeId || jobNumbers?.length || fromRaw || toRaw);
  const effectiveFrom = from ?? (hasAnyFilter ? undefined : new Date(Date.now() - 56 * 86400000));
  const to = toRaw ? (parseIsoDate(toRaw) ?? undefined) : undefined;

  const [scope, rows] = await Promise.all([
    scopedEmployeeIds(me),
    fetchTimesheetDays(me, { employeeId, jobNumbers, from: effectiveFrom, to }),
  ]);

  const employeeOptions = await prisma.employee.findMany({
    where: scope ? { id: { in: scope } } : {},
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const summary = summarizeByEmployee(rows);
  const grandTotal = summary.reduce(
    (acc, s) => ({
      days: acc.days + s.days,
      st: acc.st + s.stHours,
      ot: acc.ot + s.otHours,
      expenses: acc.expenses + s.expenses,
    }),
    { days: 0, st: 0, ot: 0, expenses: 0 },
  );

  const exportHref = `/api/timesheets-export?${new URLSearchParams({
    ...(employeeId ? { employeeId } : {}),
    ...(jobNumbersRaw ? { jobNumbers: jobNumbersRaw } : {}),
    ...(fromRaw ? { from: fromRaw } : {}),
    ...(toRaw ? { to: toRaw } : {}),
  }).toString()}`;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-3">
      {/* Header: title, stat chips, actions + filter bar */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 5.5V10l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Timesheets</h1>
              <p className="text-[11px] text-slate-400">
                Summary by employee, with day-level detail below.
                {scope && " Showing only employees assigned to you."}
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
            <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
              Employees <span className={chipNum}>{summary.length}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow shadow-sky-400/60" />
              Days <span className={chipNum}>{grandTotal.days}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
              ST hrs <span className={chipNum}>{grandTotal.st}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
              OT hrs <span className={chipNum}>{grandTotal.ot}</span>
            </span>
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-teal-300 shadow shadow-teal-300/60" />
              Expenses <span className={chipNum}>{money(grandTotal.expenses)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <PinUnlockLink
              href={exportHref}
              scope="export"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-400/15"
            >
              Export ({rows.length} rows)
            </PinUnlockLink>
            <Link
              href="/admin"
              className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
            >
              ← Admin home
            </Link>
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-2.5 border-t border-white/[0.06] px-3 py-2.5">
          <label className={labelCls}>
            Employee
            <select name="employeeId" defaultValue={employeeId ?? ""} className={`${inputCls} w-52`}>
              <option value="">All</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {[e.firstName, e.lastName].filter(Boolean).join(" ") || e.id}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            From
            <input type="date" name="from" defaultValue={fromRaw ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            To
            <input type="date" name="to" defaultValue={toRaw ?? ""} className={inputCls} />
          </label>
          <label className={`${labelCls} min-w-[220px] flex-1`}>
            Job number(s) — comma-separated
            <input
              name="jobNumbers"
              defaultValue={jobNumbersRaw ?? ""}
              placeholder="e.g. 26-1234-001, 26-1234-002"
              className={`${inputCls} w-full`}
            />
          </label>
          <button
            type="submit"
            className="flex h-8 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-4 text-xs font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500"
          >
            Apply
          </button>
          <a
            href="/admin/timesheets"
            className="flex h-8 items-center rounded-lg border border-white/10 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
          >
            Clear
          </a>
        </form>

        <ImportTimesheets />
      </section>

      {/* Summary by employee */}
      <section className={`mt-3 overflow-hidden ${cardClass}`}>
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">Summary by employee</h2>
          <span className="text-[11px] text-slate-500">
            {summary.length} employee{summary.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="max-h-[50vh] overflow-auto md:max-h-[28vh]">
          <table className="w-full text-left text-[13px]">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Employee</th>
                <th className={th}>Days</th>
                <th className={th}>ST Hrs</th>
                <th className={th}>OT Hrs</th>
                <th className={th}>PTO</th>
                <th className={th}>Vacation</th>
                <th className={th}>Holiday</th>
                <th className={th}>Per Diem</th>
                <th className={th}>Miles</th>
                <th className={th}>Mileage $</th>
                <th className={th}>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                    No timesheet entries match these filters.
                  </td>
                </tr>
              )}
              {summary.map((s) => (
                <tr key={s.employeeId} className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]">
                  <td className={td}>
                    <Link
                      href={`/admin/timesheets?employeeId=${s.employeeId}`}
                      className="font-semibold text-sky-300 hover:text-sky-200 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className={td}>{s.days}</td>
                  <td className={td}>{s.stHours}</td>
                  <td className={td}>{s.otHours}</td>
                  <td className={td}>{s.ptoHours}</td>
                  <td className={td}>{s.vacationHours}</td>
                  <td className={td}>{s.holidayHours}</td>
                  <td className={td}>{money(s.perDiem)}</td>
                  <td className={td}>{s.mileageDriven}</td>
                  <td className={td}>{money(s.mileageAmount)}</td>
                  <td className={`${td} font-semibold text-white`}>{money(s.expenses)}</td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot className="sticky bottom-0 bg-[#0d1a31]">
                <tr className="font-semibold text-white shadow-[0_-1px_0_rgba(255,255,255,0.08)]">
                  <td className={`${td} text-[11px] uppercase tracking-wider text-sky-300/90`}>Total</td>
                  <td className={`${td} text-white`}>{grandTotal.days}</td>
                  <td className={`${td} text-white`}>{grandTotal.st}</td>
                  <td className={`${td} text-white`}>{grandTotal.ot}</td>
                  <td className={td} colSpan={5}></td>
                  <td className={`${td} text-white`}>{money(grandTotal.expenses)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Day-level detail */}
      <section className={`mt-3 overflow-hidden ${cardClass}`}>
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-white">Detail</h2>
          <span className="rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-[11px] text-sky-200">
            {rows.length} day{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="max-h-[70vh] min-h-[220px] overflow-auto md:max-h-[calc(100vh-430px)]">
          <table className="w-full text-left text-[13px]">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Date</th>
                <th className={th}>Employee</th>
                <th className={th}>Job #</th>
                <th className={th}>Details</th>
                <th className={th}>ST</th>
                <th className={th}>OT</th>
                <th className={th}>Per Diem</th>
                <th className={th}>Miles</th>
                <th className={th}>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const emp = r.timesheet.employee;
                const expenses =
                  (r.lodging ?? 0) + (r.meals ?? 0) + (r.airfare ?? 0) + (r.fuel ?? 0) +
                  (r.carRental ?? 0) + (r.gasoline ?? 0) + (r.parking ?? 0) + (r.misc ?? 0);
                return (
                  <tr key={r.id} className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]">
                    <td className={`${td} text-slate-400`}>{isoDate(r.date)}</td>
                    <td className={`${td} text-white`}>{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}</td>
                    <td className={`${td} font-mono text-xs`}>{r.jobNumber ?? r.timesheet.jobNumber ?? dash}</td>
                    <td className={`${td} min-w-48 whitespace-normal text-slate-400`}>{r.details ?? dash}</td>
                    <td className={td}>{r.stHours ?? dash}</td>
                    <td className={td}>{r.otHours ?? dash}</td>
                    <td className={td}>{r.perDiem ? money(r.perDiem) : dash}</td>
                    <td className={td}>{r.mileageDriven ?? dash}</td>
                    <td className={td}>{expenses ? money(expenses) : dash}</td>
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
