import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { weekDates, weekEndingFor, isoDate, parseIsoDate, DAY_LABELS } from "@/lib/timesheetWeek";
import { saveTimesheet } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded border border-white/10 bg-slate-800/60 px-1.5 py-1 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400";
const th = "px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap";
const td = "px-1 py-1 align-top";

function n(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}
function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

export default async function TimesheetPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ week?: string; saved?: string }>;
}) {
  const { token } = await params;
  const { week, saved } = await searchParams;

  const link = await prisma.employeeTimesheetToken.findUnique({
    where: { token },
    include: { employee: true },
  });
  if (!link || link.revokedAt) notFound();
  const e = link.employee;
  const name = [e.firstName, e.lastName].filter(Boolean).join(" ") || "Employee";

  const weekEnding = (week && parseIsoDate(week)) || weekEndingFor(new Date());
  const days = weekDates(weekEnding);

  const [existing, recent] = await Promise.all([
    prisma.timesheet.findUnique({
      where: { employeeId_weekEnding: { employeeId: e.id, weekEnding } },
      include: { days: true },
    }),
    prisma.timesheet.findMany({
      where: { employeeId: e.id },
      orderBy: { weekEnding: "desc" },
      take: 8,
      select: { weekEnding: true },
    }),
  ]);
  const dayByDate = new Map((existing?.days ?? []).map((d) => [isoDate(d.date), d]));

  const totals = { st: 0, ot: 0, pto: 0, vac: 0, hol: 0, perDiem: 0, miles: 0, mileageAmt: 0 };
  const expTotals = { lodging: 0, meals: 0, airfare: 0, fuel: 0, carRental: 0, gasoline: 0, parking: 0, misc: 0 };
  for (const d of existing?.days ?? []) {
    totals.st += d.stHours ?? 0;
    totals.ot += d.otHours ?? 0;
    totals.pto += d.ptoHours ?? 0;
    totals.vac += d.vacationHours ?? 0;
    totals.hol += d.holidayHours ?? 0;
    totals.perDiem += d.perDiem ?? 0;
    totals.miles += d.mileageDriven ?? 0;
    totals.mileageAmt += d.mileageAmount ?? 0;
    expTotals.lodging += d.lodging ?? 0;
    expTotals.meals += d.meals ?? 0;
    expTotals.airfare += d.airfare ?? 0;
    expTotals.fuel += d.fuel ?? 0;
    expTotals.carRental += d.carRental ?? 0;
    expTotals.gasoline += d.gasoline ?? 0;
    expTotals.parking += d.parking ?? 0;
    expTotals.misc += d.misc ?? 0;
  }
  const weekDollarTotal = totals.perDiem + totals.mileageAmt; // matches the source template's own "Total" formula
  const expenseCategoryTotal = Object.values(expTotals).reduce((s, v) => s + v, 0);
  const totalEmployeeExpenses = weekDollarTotal + expenseCategoryTotal;
  const advanced = existing?.advancedToEmployee ?? 0;
  const amountDue = totalEmployeeExpenses - advanced;

  const prevWeek = isoDate(new Date(weekEnding.getTime() - 7 * 86400000));
  const nextWeek = isoDate(new Date(weekEnding.getTime() + 7 * 86400000));

  return (
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-5xl px-4">
        <header className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-400">FER Time &amp; Expense</p>
          <h1 className="mt-1 text-2xl font-bold text-white">{name}&apos;s Timesheet</h1>
          <p className="mt-1 text-xs text-slate-500">
            This link is just for entering your own weekly time. Don&apos;t share it.
          </p>
        </header>

        {saved === "1" && (
          <p className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Saved.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <a href={`?week=${prevWeek}`} className="text-cyan-400 hover:underline">
            ← Previous week
          </a>
          <span className="text-slate-400">Week ending {isoDate(weekEnding)}</span>
          <a href={`?week=${nextWeek}`} className="text-cyan-400 hover:underline">
            Next week →
          </a>
          {recent.length > 0 && (
            <span className="text-slate-500">
              · Recent:{" "}
              {recent.map((r, i) => (
                <span key={isoDate(r.weekEnding)}>
                  {i > 0 && ", "}
                  <a href={`?week=${isoDate(r.weekEnding)}`} className="text-cyan-400 hover:underline">
                    {isoDate(r.weekEnding)}
                  </a>
                </span>
              ))}
            </span>
          )}
        </div>

        <form action={saveTimesheet} className="space-y-4 rounded-lg border border-white/10 bg-slate-900/60 p-4 shadow-lg shadow-black/30 backdrop-blur">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="weekEnding" value={isoDate(weekEnding)} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-slate-400">
              Client Name
              <input name="clientName" defaultValue={existing?.clientName ?? ""} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              Location
              <input name="location" defaultValue={existing?.location ?? ""} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-slate-400">
              FER Job #
              <input name="jobNumber" defaultValue={existing?.jobNumber ?? e.jobNumber ?? ""} className={`${inputCls} mt-1`} />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={th}>Day</th>
                  <th className={th}>Date</th>
                  <th className={th}>AFE#</th>
                  <th className={th}>WO#</th>
                  <th className={th}>Details</th>
                  <th className={th}>ST Hrs</th>
                  <th className={th}>OT Hrs</th>
                  <th className={th}>PTO</th>
                  <th className={th}>Vacation</th>
                  <th className={th}>Holiday</th>
                  <th className={th}>Per Diem</th>
                  <th className={th}>Miles</th>
                  <th className={th}>Mileage $</th>
                </tr>
              </thead>
              <tbody>
                {days.map((date, i) => {
                  const d = dayByDate.get(isoDate(date));
                  return (
                    <tr key={i} className="border-b border-white/5">
                      <td className={td}>{DAY_LABELS[i]}</td>
                      <td className={`${td} whitespace-nowrap text-slate-400`}>{isoDate(date)}</td>
                      <td className={td}><input name={`afeNumber_${i}`} defaultValue={d?.afeNumber ?? ""} className={inputCls} /></td>
                      <td className={td}><input name={`woNumber_${i}`} defaultValue={d?.woNumber ?? ""} className={inputCls} /></td>
                      <td className={td}><input name={`details_${i}`} defaultValue={d?.details ?? ""} className={`${inputCls} min-w-[140px]`} /></td>
                      <td className={td}><input type="number" step="0.25" min="0" name={`stHours_${i}`} defaultValue={n(d?.stHours)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.25" min="0" name={`otHours_${i}`} defaultValue={n(d?.otHours)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.25" min="0" name={`ptoHours_${i}`} defaultValue={n(d?.ptoHours)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.25" min="0" name={`vacationHours_${i}`} defaultValue={n(d?.vacationHours)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.25" min="0" name={`holidayHours_${i}`} defaultValue={n(d?.holidayHours)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`perDiem_${i}`} defaultValue={n(d?.perDiem)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.1" min="0" name={`mileageDriven_${i}`} defaultValue={n(d?.mileageDriven)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`mileageAmount_${i}`} defaultValue={n(d?.mileageAmount)} className={`${inputCls} w-16`} /></td>
                    </tr>
                  );
                })}
                <tr className="font-semibold text-slate-200">
                  <td className={td} colSpan={5}>TOTAL</td>
                  <td className={td}>{totals.st}</td>
                  <td className={td}>{totals.ot}</td>
                  <td className={td}>{totals.pto}</td>
                  <td className={td}>{totals.vac}</td>
                  <td className={td}>{totals.hol}</td>
                  <td className={td}>{money(totals.perDiem)}</td>
                  <td className={td}>{totals.miles}</td>
                  <td className={td}>{money(totals.mileageAmt)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <label className="block text-xs text-slate-400">
            Notes
            <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className={`${inputCls} mt-1`} />
          </label>

          <p className="text-xs uppercase tracking-wide text-slate-500">
            Please list each charge separately with detailed description &amp; amount. Attach receipts separately.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={th}>Day</th>
                  <th className={th}>Date</th>
                  <th className={th}>Lodging</th>
                  <th className={th}>Meals</th>
                  <th className={th}>Airfare</th>
                  <th className={th}>Fuel</th>
                  <th className={th}>Car Rent</th>
                  <th className={th}>Gasoline</th>
                  <th className={th}>Parking</th>
                  <th className={th}>Misc</th>
                  <th className={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {days.map((date, i) => {
                  const d = dayByDate.get(isoDate(date));
                  return (
                    <tr key={i} className="border-b border-white/5">
                      <td className={td}>{DAY_LABELS[i]}</td>
                      <td className={`${td} whitespace-nowrap text-slate-400`}>{isoDate(date)}</td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`lodging_${i}`} defaultValue={n(d?.lodging)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`meals_${i}`} defaultValue={n(d?.meals)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`airfare_${i}`} defaultValue={n(d?.airfare)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`fuel_${i}`} defaultValue={n(d?.fuel)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`carRental_${i}`} defaultValue={n(d?.carRental)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`gasoline_${i}`} defaultValue={n(d?.gasoline)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`parking_${i}`} defaultValue={n(d?.parking)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input type="number" step="0.01" min="0" name={`misc_${i}`} defaultValue={n(d?.misc)} className={`${inputCls} w-16`} /></td>
                      <td className={td}><input name={`expenseDescription_${i}`} defaultValue={d?.expenseDescription ?? ""} className={`${inputCls} min-w-[140px]`} /></td>
                    </tr>
                  );
                })}
                <tr className="font-semibold text-slate-200">
                  <td className={td} colSpan={2}>TOTAL</td>
                  <td className={td}>{money(expTotals.lodging)}</td>
                  <td className={td}>{money(expTotals.meals)}</td>
                  <td className={td}>{money(expTotals.airfare)}</td>
                  <td className={td}>{money(expTotals.fuel)}</td>
                  <td className={td}>{money(expTotals.carRental)}</td>
                  <td className={td}>{money(expTotals.gasoline)}</td>
                  <td className={td}>{money(expTotals.parking)}</td>
                  <td className={td}>{money(expTotals.misc)}</td>
                  <td className={td}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div className="text-sm text-slate-300">
              Total Employee Expenses
              <div className="text-lg font-semibold text-white">{money(totalEmployeeExpenses)}</div>
            </div>
            <label className="text-xs text-slate-400">
              Advanced to Employee
              <input
                type="number"
                step="0.01"
                min="0"
                name="advancedToEmployee"
                defaultValue={existing?.advancedToEmployee ?? ""}
                className={`${inputCls} mt-1`}
              />
            </label>
            <div className="text-sm text-slate-300">
              Amount Due to Employee
              <div className="text-lg font-semibold text-white">{money(amountDue)}</div>
            </div>
          </div>

          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500">
            Save this week
          </button>
        </form>
      </div>
    </main>
  );
}
