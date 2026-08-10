import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { STATUS_LABEL, STATUS_STYLE } from "./statusLabels";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));

  const where =
    me.role === "PROJECT_MANAGER"
      ? { createdByUserId: me.id }
      : me.role === "ACCOUNT_MANAGER"
        ? { status: { not: "DRAFT" } }
        : {};

  const all = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { client: true, lineItems: true },
  });

  const invoices = all;

  const th =
    "border border-gray-300 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600";
  const td = "border border-gray-300 px-3 py-2 align-top text-gray-800";

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

        <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Site</th>
                <th className={th}>Client</th>
                <th className={th}>Total</th>
                <th className={th}>Status</th>
                <th className={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-gray-400`} colSpan={5}>
                    No invoices yet.
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const total = inv.lineItems.reduce((sum, li) => sum + li.amount, 0);
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
