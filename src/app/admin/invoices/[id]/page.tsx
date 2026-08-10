import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";
import { addLineItem, deleteLineItem } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  AM_APPROVED: "AM Approved",
  ADMIN_APPROVED: "Admin Approved (sending)",
  SENT: "Sent",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      lineItems: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) notFound();

  const isOwnerPM = me.role === "PROJECT_MANAGER" && invoice.createdByUserId === me.id;
  const isAM = me.role === "ACCOUNT_MANAGER";
  const isAdmin = isAdminRole(me.role);
  if (!isOwnerPM && !isAM && !isAdmin) redirect("/admin/invoices");

  const isDraftEditable = invoice.status === "DRAFT" && isOwnerPM;
  const total = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);

  const th = "px-2 py-1 text-left text-xs font-semibold uppercase text-gray-500";
  const td = "px-2 py-1.5 text-gray-800";

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.site}</h1>
            <p className="text-sm text-gray-500">
              {invoice.client.name} · {invoice.client.email}
            </p>
          </div>
          <Link href="/admin/invoices" className="text-sm text-blue-600 hover:underline">
            ← All invoices
          </Link>
        </div>

        <span className="inline-block rounded-md bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
          {STATUS_LABEL[invoice.status] ?? invoice.status}
        </span>

        {invoice.rejectionReason && invoice.status === "DRAFT" && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <strong>Rejected:</strong> {invoice.rejectionReason}
          </p>
        )}

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Line items</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Description</th>
                <th className={th}>Amount</th>
                {isDraftEditable && <th className={th}></th>}
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id} className="border-t border-gray-100">
                  <td className={td}>{li.description}</td>
                  <td className={td}>${li.amount.toFixed(2)}</td>
                  {isDraftEditable && (
                    <td className={td}>
                      <form action={deleteLineItem}>
                        <input type="hidden" name="lineItemId" value={li.id} />
                        <button className="text-xs text-red-600 hover:underline">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t border-gray-200 font-semibold">
                <td className={td}>Total</td>
                <td className={td}>${total.toFixed(2)}</td>
                {isDraftEditable && <td className={td}></td>}
              </tr>
            </tbody>
          </table>

          {isDraftEditable && (
            <form action={addLineItem} className="mt-4 flex gap-2">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input
                name="description"
                placeholder="Description"
                required
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                required
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900"
              >
                Add
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
