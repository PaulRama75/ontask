import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getNavAccess, firstAllowedNavHref, getRestrictedSites } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type GroupBy = "client" | "jobNumber";

export default async function BillingSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; archived?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));

  const { groupBy: groupByParam, archived: archivedParam } = await searchParams;
  const groupBy: GroupBy = groupByParam === "jobNumber" ? "jobNumber" : "client";
  const showArchived = archivedParam === "1";

  // Same site-scoping rule as the invoices list -- a PM/PL only ever sees
  // totals for sites they've been granted under Site Access.
  const isPMorPL = me.role === "PROJECT_MANAGER" || me.role === "PROJECT_LEAD";
  const restrictedSites = isPMorPL ? await getRestrictedSites(me.id) : null;

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(isPMorPL && restrictedSites ? { site: { in: [...restrictedSites] } } : {}),
      status: { in: ["SENT", "PAID"] },
      archived: showArchived,
    },
    include: { client: true, lineItems: true },
  });

  type Row = { key: string; total: number; count: number };
  const groups = new Map<string, Row>();
  for (const inv of invoices) {
    const total = inv.lineItems.reduce((sum, li) => sum + li.amount, 0);
    const key = groupBy === "client" ? inv.client.name : inv.jobNumber || "(No job number)";
    const existing = groups.get(key);
    if (existing) {
      existing.total += total;
      existing.count += 1;
    } else {
      groups.set(key, { key, total, count: 1 });
    }
  }
  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  function groupByHref(g: GroupBy) {
    const sp = new URLSearchParams();
    sp.set("groupBy", g);
    if (showArchived) sp.set("archived", "1");
    return `/admin/invoices/billing?${sp.toString()}`;
  }

  function archivedHref(next: boolean) {
    const sp = new URLSearchParams();
    sp.set("groupBy", groupBy);
    if (next) sp.set("archived", "1");
    return `/admin/invoices/billing?${sp.toString()}`;
  }

  const th =
    "border border-white/10 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300";
  const td = "border border-white/10 px-3 py-2 text-slate-200";
  const tabBase = "px-3 py-1.5 text-sm";
  const tabActive = "bg-blue-600 text-white";
  const tabInactive = "bg-slate-800/60 text-slate-300 hover:bg-white/5";

  return (
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Billing summary</h1>
            <p className="text-sm text-slate-400">
              Total billed (Sent + Paid invoices), grouped by {groupBy === "client" ? "client" : "job number"}.
            </p>
          </div>
          <Link href="/admin/invoices" className="text-sm text-cyan-400 hover:underline">
            ← All invoices
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-white/10">
            <Link href={groupByHref("client")} className={`${tabBase} ${groupBy === "client" ? tabActive : tabInactive}`}>
              By client
            </Link>
            <Link
              href={groupByHref("jobNumber")}
              className={`${tabBase} ${groupBy === "jobNumber" ? tabActive : tabInactive}`}
            >
              By job number
            </Link>
          </div>
          <Link href={archivedHref(!showArchived)} className="text-sm text-slate-400 hover:text-slate-200">
            {showArchived ? "Hide archived" : "Include archived"}
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className={th}>{groupBy === "client" ? "Client" : "Job No#"}</th>
                <th className={th}>Invoices</th>
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-slate-500`} colSpan={3}>
                    No Sent or Paid invoices{showArchived ? "" : " -- try including archived"}.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className={td}>{r.key}</td>
                  <td className={td}>{r.count}</td>
                  <td className={td}>${r.total.toFixed(2)}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="font-semibold">
                  <td className={td}>Total</td>
                  <td className={td}>{invoices.length}</td>
                  <td className={td}>${grandTotal.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
