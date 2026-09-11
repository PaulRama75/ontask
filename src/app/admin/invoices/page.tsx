import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref, getRestrictedSites } from "@/lib/rbac";
import { STATUS_LABEL, STATUS_STYLE } from "./statusLabels";
import InvoiceControls from "./InvoiceControls";

export const dynamic = "force-dynamic";

const SORT_KEYS = ["site", "client", "jobNumber", "total", "status", "createdAt", "updatedAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as readonly string[]).includes(v);
}

// Date-only display makes same-day invoices look identical and their sort
// order look broken -- show the time too so ordering is visibly correct.
function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; dir?: string; archived?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));

  const {
    q = "",
    status = "all",
    sort: sortParam,
    dir: dirParam,
    archived: archivedParam,
  } = await searchParams;
  const sort: SortKey = sortParam && isSortKey(sortParam) ? sortParam : "createdAt";
  const dir: "asc" | "desc" = dirParam === "asc" ? "asc" : "desc";
  const showArchived = archivedParam === "1";

  // Project Managers and Project Leads see every invoice for the site(s)
  // they've been granted under Site Access (not just ones they created) --
  // no rows there means unrestricted, same convention as the data grid.
  const isPMorPL = me.role === "PROJECT_MANAGER" || me.role === "PROJECT_LEAD";
  const restrictedSites = isPMorPL ? await getRestrictedSites(me.id) : null;
  const where = isPMorPL
    ? restrictedSites
      ? { site: { in: [...restrictedSites] } }
      : {}
    : me.role === "ACCOUNT_MANAGER"
      ? { status: { not: "DRAFT" } }
      : {};

  const all = await prisma.invoice.findMany({
    where,
    include: { client: true, lineItems: true },
  });

  const withTotals = all.map((inv) => ({
    ...inv,
    total: inv.lineItems.reduce((sum, li) => sum + li.amount, 0),
  }));

  const needle = q.trim().toLowerCase();
  const filtered = withTotals.filter((inv) => {
    if (inv.archived !== showArchived) return false;
    if (status !== "all" && inv.status !== status) return false;
    if (needle) {
      const haystack = `${inv.site} ${inv.client.name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const sign = dir === "asc" ? 1 : -1;
  const invoices = [...filtered].sort((a, b) => {
    switch (sort) {
      case "site":
        return sign * a.site.localeCompare(b.site);
      case "client":
        return sign * a.client.name.localeCompare(b.client.name);
      case "jobNumber":
        return sign * (a.jobNumber ?? "").localeCompare(b.jobNumber ?? "");
      case "total":
        return sign * (a.total - b.total);
      case "status":
        return sign * a.status.localeCompare(b.status);
      case "updatedAt":
        return sign * (a.updatedAt.getTime() - b.updatedAt.getTime());
      case "createdAt":
      default:
        return sign * (a.createdAt.getTime() - b.createdAt.getTime());
    }
  });

  const th =
    "border border-white/10 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300";
  const td = "border border-white/10 px-3 py-2 align-top text-slate-200";

  // Builds an href that toggles sort direction on this column while
  // preserving the current search/status filters.
  function sortHref(key: SortKey): string {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (status !== "all") sp.set("status", status);
    sp.set("sort", key);
    sp.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/admin/invoices?${sp.toString()}`;
  }

  function SortHeader({ sortKey, label }: { sortKey: SortKey; label: string }) {
    const active = sort === sortKey;
    return (
      <th className={th}>
        <Link href={sortHref(sortKey)} className="flex items-center gap-1 hover:text-white">
          {label}
          <span className={active ? "text-slate-300" : "text-slate-600"}>
            {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </Link>
      </th>
    );
  }

  return (
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-[1400px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Invoices</h1>
            <p className="text-sm text-slate-400">
              {isPMorPL
                ? "Invoices for your assigned site(s)."
                : "Invoices awaiting or past your review."}
            </p>
          </div>
          {(isPMorPL || isAdminRole(me.role)) && (
            <Link
              href="/admin/invoices/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500"
            >
              + New invoice
            </Link>
          )}
        </div>

        <InvoiceControls
          total={withTotals.filter((inv) => inv.archived === showArchived).length}
          shown={invoices.length}
          showArchived={showArchived}
          archivedCount={withTotals.filter((inv) => inv.archived).length}
          statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />

        <div className="overflow-x-auto rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <SortHeader sortKey="site" label="Site" />
                <SortHeader sortKey="client" label="Client" />
                <SortHeader sortKey="jobNumber" label="Job No#" />
                <SortHeader sortKey="total" label="Total" />
                <SortHeader sortKey="status" label="Status" />
                <SortHeader sortKey="createdAt" label="Created" />
                <th className={th}>Modified by</th>
                <SortHeader sortKey="updatedAt" label="Modified" />
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-slate-500`} colSpan={7}>
                    {all.length === 0 ? "No invoices yet." : "No invoices match your search/filter."}
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const total = inv.total;
                return (
                  <tr key={inv.id}>
                    <td className={td}>
                      <Link href={`/admin/invoices/${inv.id}`} className="text-cyan-400 hover:underline">
                        {inv.site}
                      </Link>
                    </td>
                    <td className={td}>{inv.client.name}</td>
                    <td className={td}>{inv.jobNumber || "—"}</td>
                    <td className={td}>${total.toFixed(2)}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                      {inv.archived && (
                        <span className="ml-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300">
                          Archived
                        </span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(inv.createdAt)}</td>
                    <td className={td}>{inv.lastModifiedByName || "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(inv.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
