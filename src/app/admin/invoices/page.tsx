import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref, invoiceVisibilityWhere } from "@/lib/rbac";
import { STATUS_LABEL, STATUS_STYLE } from "./statusLabels";
import InvoiceControls from "./InvoiceControls";
import InvoicesPager from "./InvoicesPager";
import { updateClientName, updateInvoiceSite } from "./actions";

export const dynamic = "force-dynamic";

const SORT_KEYS = [
  "site",
  "client",
  "invoiceNumber",
  "jobNumber",
  "total",
  "status",
  "createdAt",
  "updatedAt",
] as const;
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

  // PM/PL see only invoices they created; admins see all (see
  // invoiceVisibilityWhere in rbac.ts for the full rule).
  const where = invoiceVisibilityWhere(me);
  const isPMorPL = me.role === "PROJECT_MANAGER" || me.role === "PROJECT_LEAD";

  const all = await prisma.invoice.findMany({
    where,
    include: { client: true, lineItems: true },
  });

  const withTotals = all.map((inv) => ({
    ...inv,
    total: inv.lineItems.reduce((sum, li) => sum + li.amount, 0),
    // The invoice's own line-item descriptions, oldest first, for the list view.
    description: [...inv.lineItems]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((li) => li.description.trim())
      .filter(Boolean)
      .join("; "),
  }));

  const needle = q.trim().toLowerCase();
  const filtered = withTotals.filter((inv) => {
    if (inv.archived !== showArchived) return false;
    if (status !== "all" && inv.status !== status) return false;
    if (needle) {
      const haystack = `${inv.site} ${inv.clientName ?? inv.client.name} ${inv.description}`.toLowerCase();
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
        return sign * (a.clientName ?? a.client.name).localeCompare(b.clientName ?? b.client.name);
      case "invoiceNumber":
        return sign * (a.invoiceNumber ?? "").localeCompare(b.invoiceNumber ?? "");
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

  // Display-only counts for the stat chips (same archived view as the table).
  const visible = withTotals.filter((inv) => inv.archived === showArchived);
  const countOf = (...statuses: string[]) => visible.filter((inv) => statuses.includes(inv.status)).length;

  const cardClass =
    "rounded-xl border border-sky-400/15 bg-gradient-to-b from-[#0f1d36]/95 to-[#0b1529]/95 shadow-xl shadow-black/40 ring-1 ring-white/[0.03] backdrop-blur";
  const th = "whitespace-nowrap px-3 py-2.5 text-left";
  const td = "px-3 py-1.5 align-middle text-slate-300";
  const chip =
    "flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a1426] px-2.5 text-[11px] uppercase tracking-wider text-slate-400";
  const smallInput =
    "h-7 rounded-md border border-white/10 bg-[#0a1426] px-2 text-xs text-white focus:border-sky-400/60 focus:outline-none focus:ring-1 focus:ring-sky-400/40";
  const saveBtn =
    "rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-0.5 text-xs text-sky-200 transition-colors hover:bg-sky-400/15";

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
          <span className={active ? "text-sky-200" : "text-slate-600"}>
            {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </Link>
      </th>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-2 pt-3">
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-blue-600/30">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M5 2.5h7l3 3v12H5z" strokeLinejoin="round" /><path d="M8 9h4M8 12h4M8 15h2" strokeLinecap="round" /></svg>
            </span>
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Invoices</h1>
              <p className="text-[11px] text-slate-400">
                {isPMorPL ? "Invoices you created." : "Invoices awaiting or past your review."}
              </p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
          <span className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/10 px-2.5 text-[11px] uppercase tracking-wider text-sky-200 shadow-inner shadow-sky-500/10">
            Total <span className="text-base font-bold text-white">{visible.length}</span>
          </span>
          <span className={chip}>
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            Draft <span className="text-base font-bold text-white">{countOf("DRAFT")}</span>
          </span>
          <span className={chip}>
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/60" />
            In review <span className="text-base font-bold text-white">{countOf("SUBMITTED", "AM_APPROVED", "ADMIN_APPROVED")}</span>
          </span>
          <span className={chip}>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
            Sent <span className="text-base font-bold text-white">{countOf("SENT")}</span>
          </span>
          <span className={chip}>
            <span className="h-2 w-2 rounded-full bg-teal-300 shadow shadow-teal-300/60" />
            Paid <span className="text-base font-bold text-white">{countOf("PAID")}</span>
          </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/invoices/billing"
              className="flex h-8 items-center rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-400/15"
            >
              Billing summary
            </Link>
            {(isPMorPL || isAdminRole(me.role)) && (
              <Link
                href="/admin/invoices/new"
                className="flex h-8 items-center rounded-lg bg-gradient-to-b from-sky-500 to-blue-600 px-3 text-xs font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:from-sky-400 hover:to-blue-500"
              >
                + New invoice
              </Link>
            )}
          </div>
        </div>

      </section>

      <section className={`mt-3 overflow-hidden ${cardClass}`}>
        <InvoiceControls
          total={withTotals.filter((inv) => inv.archived === showArchived).length}
          shown={invoices.length}
          showArchived={showArchived}
          archivedCount={withTotals.filter((inv) => inv.archived).length}
          statusOptions={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        />

        <InvoicesPager heightClass="max-h-[70vh] lg:max-h-[calc(100vh-310px)] xl:max-h-[calc(100vh-292px)]">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-[#0d1a31] text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300/90 shadow-[0_1px_0_rgba(255,255,255,0.08)]">
              <tr>
                <SortHeader sortKey="site" label="Site" />
                <SortHeader sortKey="client" label="Client" />
                <th className={th}>Description</th>
                <SortHeader sortKey="invoiceNumber" label="Invoice#" />
                <SortHeader sortKey="jobNumber" label="Job No#" />
                <SortHeader sortKey="total" label="Total" />
                <SortHeader sortKey="status" label="Status" />
                <th className={th}>Modified by</th>
                <SortHeader sortKey="updatedAt" label="Modified" />
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={9}>
                    {all.length === 0 ? "No invoices yet." : "No invoices match your search/filter."}
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const total = inv.total;
                return (
                  <tr
                    key={inv.id}
                    data-row
                    className="border-b border-white/[0.06] transition-colors hover:bg-sky-400/[0.05]"
                  >
                    <td className={`${td} min-w-32`}>
                      <Link href={`/admin/invoices/${inv.id}`} className="font-semibold text-sky-300 hover:text-sky-200 hover:underline">
                        {inv.site}
                      </Link>
                      {(isAdminRole(me.role) || inv.createdByUserId === me.id) && (
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-sky-300">Edit site</summary>
                          <form action={updateInvoiceSite} className="mt-1 flex items-center gap-1">
                            <input type="hidden" name="invoiceId" value={inv.id} />
                            <input
                              name="site"
                              defaultValue={inv.site}
                              aria-label="Site for this invoice"
                              className={`w-28 ${smallInput}`}
                            />
                            <button className={saveBtn}>Save</button>
                          </form>
                        </details>
                      )}
                    </td>
                    <td className={td}>
                      {/* Same rule as the invoice page: its creator or an Admin may rename it. */}
                      {isAdminRole(me.role) || inv.createdByUserId === me.id ? (
                        <form action={updateClientName} className="flex items-center gap-1">
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <input
                            name="clientName"
                            defaultValue={inv.clientName ?? inv.client.name}
                            aria-label={`Client name for ${inv.site} invoice`}
                            className={`w-32 ${smallInput}`}
                          />
                          <button className={saveBtn}>Save</button>
                        </form>
                      ) : (
                        <span className="text-white">{inv.clientName ?? inv.client.name}</span>
                      )}
                    </td>
                    <td className={`${td} min-w-48 max-w-xs`}>
                      <span className="line-clamp-2 text-slate-400" title={inv.description}>
                        {inv.description || "—"}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{inv.invoiceNumber || <span className="text-slate-600">—</span>}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-xs`}>{inv.jobNumber || <span className="text-slate-600">—</span>}</td>
                    <td className={`${td} whitespace-nowrap font-semibold tabular-nums text-white`}>${total.toFixed(2)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[inv.status]}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                      {inv.archived && (
                        <span className="ml-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                          Archived
                        </span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{inv.lastModifiedByName || "—"}</td>
                    <td className={`${td} whitespace-nowrap text-xs text-slate-400`}>{formatDateTime(inv.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </InvoicesPager>
      </section>
    </main>
  );
}
