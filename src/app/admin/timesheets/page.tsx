import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { fetchTimesheetDays, scopedEmployeeIds, summarizeByEmployee } from "@/lib/timesheetReport";
import { isoDate, parseIsoDate } from "@/lib/timesheetWeek";
import ImportTimesheets from "./ImportTimesheets";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-white/10 bg-slate-800/60 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400";
const th = "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap";
const td = "px-2 py-1.5 text-slate-200 whitespace-nowrap";

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
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Timesheets</h1>
            <p className="text-sm text-slate-400">
              Summary by employee, with day-level detail below matching the current filters.
              {scope && " Showing only employees assigned to you."}
            </p>
          </div>
          <Link href="/admin" className="text-sm text-cyan-400 hover:underline">
            ← Admin home
          </Link>
        </div>

        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-slate-900/60 p-4 shadow-lg shadow-black/30 backdrop-blur">
          <label className="text-xs text-slate-400">
            Employee
            <select name="employeeId" defaultValue={employeeId ?? ""} className={`${inputCls} mt-1 block`}>
              <option value="">All</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {[e.firstName, e.lastName].filter(Boolean).join(" ") || e.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            From
            <input type="date" name="from" defaultValue={fromRaw ?? ""} className={`${inputCls} mt-1 block`} />
          </label>
          <label className="text-xs text-slate-400">
            To
            <input type="date" name="to" defaultValue={toRaw ?? ""} className={`${inputCls} mt-1 block`} />
          </label>
          <label className="text-xs text-slate-400">
            Job number(s) — comma-separated
            <input
              name="jobNumbers"
              defaultValue={jobNumbersRaw ?? ""}
              placeholder="e.g. 26-1234-001, 26-1234-002"
              className={`${inputCls} mt-1 block w-64`}
            />
          </label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500">
            Apply
          </button>
          <a href="/admin/timesheets" className="text-xs text-slate-400 hover:underline">
            Clear
          </a>
          <a href={exportHref} className="ml-auto rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            Export ({rows.length} rows)
          </a>
        </form>

        <ImportTimesheets />

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Summary by employee
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
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
                    <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                      No timesheet entries match these filters.
                    </td>
                  </tr>
                )}
                {summary.map((s) => (
                  <tr key={s.employeeId} className="border-b border-white/5">
                    <td className={td}>
                      <Link href={`/admin/timesheets?employeeId=${s.employeeId}`} className="text-cyan-400 hover:underline">
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
                    <td className={td}>{money(s.expenses)}</td>
                  </tr>
                ))}
              </tbody>
              {summary.length > 0 && (
                <tfoot>
                  <tr className="border-t border-white/10 font-semibold text-slate-200">
                    <td className={td}>Total</td>
                    <td className={td}>{grandTotal.days}</td>
                    <td className={td}>{grandTotal.st}</td>
                    <td className={td}>{grandTotal.ot}</td>
                    <td className={td} colSpan={5}></td>
                    <td className={td}>{money(grandTotal.expenses)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Detail ({rows.length} day{rows.length === 1 ? "" : "s"})
          </h2>
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-white/10">
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
                    <tr key={r.id} className="border-b border-white/5">
                      <td className={td}>{isoDate(r.date)}</td>
                      <td className={td}>{[emp.firstName, emp.lastName].filter(Boolean).join(" ")}</td>
                      <td className={td}>{r.jobNumber ?? r.timesheet.jobNumber ?? "—"}</td>
                      <td className={`${td} whitespace-normal`}>{r.details ?? "—"}</td>
                      <td className={td}>{r.stHours ?? "—"}</td>
                      <td className={td}>{r.otHours ?? "—"}</td>
                      <td className={td}>{r.perDiem ? money(r.perDiem) : "—"}</td>
                      <td className={td}>{r.mileageDriven ?? "—"}</td>
                      <td className={td}>{expenses ? money(expenses) : "—"}</td>
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
