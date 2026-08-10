import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { STATUS_LABEL, STATUS_STYLE } from "./statusLabels";
import InvoiceControls from "./InvoiceControls";

export const dynamic = "force-dynamic";

const SORT_KEYS = ["site", "client", "total", "status", "createdAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(v: string): v is SortKey {
  return (SORT_KEYS as readonly string[]).includes(v);
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));

  const { q = "", status = "all", sort: sortParam, dir: dirParam } = await searchParams;
  const sort: SortKey = sortParam && isSortKey(sortParam) ? sortParam : "createdAt";
  const dir: "asc" | "desc" = dirParam === "asc" ? "asc" : "desc";

  const where =
    me.role === "PROJECT_MANAGER"
      ? { createdByUserId: me.id }
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
      case "total":
        return sign * (a.total - b.total);
      case "status":
        return sign * a.status.localeCompare(b.status);
      case "createdAt":
      default:
        return sign * (a.createdAt.getTime() - b.createdAt.getTime());
    }
  });

  const th =
    "border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600";
  const td = "border border-gray-300 px-3 py-2 align-top text-gray-800";

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
        <Link href={sortHref(sortKey)} className="flex items-center gap-1 hover:text-gray-900">
          {label}
          <span className={active ? "text-gray-700" : "text-gray-300"}>
            {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </Link>
      </th>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
            <p className="text-sm text-gray-500">
              {me.role === "PROJECT_MANAGER"
                ? "Invoices you've created."
                : "Invoices awaiting or past your review."}
            </p>
          </div>
          {(me.role === "PROJECT_MANAGER" || isAdminRole(me.role)) && (
            <Link
              href="/admin/invoices/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + New invoice
            </Link>
          )}
        </div>

        <InvoiceControls
          total={all.length}
          shown={invoices.length}
          statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader sortKey="site" label="Site" />
                <SortHeader sortKey="client" label="Client" />
                <SortHeader sortKey="total" label="Total" />
                <SortHeader sortKey="status" label="Status" />
                <SortHeader sortKey="createdAt" label="Created" />
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-400`} colSpan={5}>
                    {all.length === 0 ? "No invoices yet." : "No invoices match your search/filter."}
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const total = inv.total;
                return (
                  <tr key={inv.id}>
                    <td className={td}>
                      <Link href={`/admin/invoices/${inv.id}`} className="text-blue-600 hover:underline">
                        {inv.site}
                      </Link>
                    </td>
                    <td className={td}>{inv.client.name}</td>
                    <td className={td}>${total.toFixed(2)}</td>
                    <td className={td}>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{inv.createdAt.toISOString().slice(0, 10)}</td>
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
