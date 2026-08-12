import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref } from "@/lib/rbac";
import { STATUS_LABEL } from "../statusLabels";
import {
  addLineItem,
  deleteLineItem,
  uploadInvoiceAttachment,
  deleteInvoiceAttachment,
  attachGridExport,
  submitInvoice,
  approveInvoice,
  rejectInvoice,
  approveAndSend,
  archiveInvoice,
  unarchiveInvoice,
  replyToRejection,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const nav = await getNavAccess(me.role);
  if (!nav.invoices) redirect(firstAllowedNavHref(nav));
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

  const isAM = me.role === "ACCOUNT_MANAGER";
  const isAdmin = isAdminRole(me.role);
  // Owner = whoever may edit this DRAFT: the PM who created it, or ANY admin
  // (admins can fully manage every invoice, same as they bypass restrictions
  // everywhere else in this app — not just the ones they personally created).
  const isOwner = isAdmin || (me.role === "PROJECT_MANAGER" && invoice.createdByUserId === me.id);
  // AMs only ever act on SUBMITTED/AM_APPROVED invoices (see the Actions
  // section below) — viewing a DRAFT serves no purpose and would let an AM
  // see a PM's in-progress invoice by guessing/sharing its URL before it's ready.
  const canView = isOwner || (isAM && invoice.status !== "DRAFT");
  if (!canView) redirect("/admin/invoices");

  const isDraftEditable = invoice.status === "DRAFT" && isOwner;
  const total = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const isRejected = invoice.status === "DRAFT" && !!invoice.rejectionReason;

  let rejector: { name: string | null; email: string } | null = null;
  if (isRejected && invoice.rejectedByUserId) {
    rejector = await prisma.user.findUnique({
      where: { id: invoice.rejectedByUserId },
      select: { name: true, email: true },
    });
  }

  let siteEmployees: { id: string; firstName: string | null; lastName: string | null }[] = [];
  if (isDraftEditable) {
    siteEmployees = await prisma.employee.findMany({
      where: { site: invoice.site },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    });
  }

  const th = "px-2 py-1 text-left text-xs font-semibold uppercase text-slate-400";
  const td = "px-2 py-1.5 text-slate-200";

  return (
    <main className="min-h-screen bg-slate-950 py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{invoice.site}</h1>
            <p className="text-sm text-slate-400">
              {invoice.client.name} ·{" "}
              <a href={`mailto:${invoice.client.email}`} className="text-cyan-400 hover:underline">
                {invoice.client.email}
              </a>
            </p>
          </div>
          <Link href="/admin/invoices" className="text-sm text-cyan-400 hover:underline">
            ← All invoices
          </Link>
        </div>

        <span className="inline-block rounded-md bg-white/5 px-3 py-1 text-sm font-semibold text-slate-300">
          {STATUS_LABEL[invoice.status] ?? invoice.status}
        </span>
        {invoice.archived && (
          <span className="ml-2 inline-block rounded-md bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
            Archived
          </span>
        )}

        {isRejected && (
          <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <p>
              <strong>Rejected{rejector ? ` by ${rejector.name || rejector.email}` : ""}:</strong>{" "}
              {invoice.rejectionReason}
            </p>
            {isOwner && rejector && (
              <form action={replyToRejection} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input
                  name="message"
                  placeholder={`Reply to ${rejector.name || rejector.email}…`}
                  required
                  className="flex-1 rounded-md border border-rose-500/30 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  className="rounded-md border border-rose-500/40 bg-slate-800/60 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10"
                >
                  Send reply
                </button>
              </form>
            )}
          </div>
        )}

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Line items</h2>
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
                <tr key={li.id} className="border-t border-white/10">
                  <td className={td}>{li.description}</td>
                  <td className={td}>${li.amount.toFixed(2)}</td>
                  {isDraftEditable && (
                    <td className={td}>
                      <form action={deleteLineItem}>
                        <input type="hidden" name="lineItemId" value={li.id} />
                        <button className="text-xs text-rose-300 hover:underline">Remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t border-white/10 font-semibold">
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
                className="flex-1 rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
              />
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Amount"
                required
                className="w-32 rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
              />
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Add
              </button>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Attachments</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {invoice.attachments.length === 0 && <li className="text-slate-500">No attachments yet.</li>}
            {invoice.attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between">
                <a
                  href={`/api/invoice-files/${att.id}`}
                  target="_blank"
                  className="text-cyan-400 hover:underline"
                >
                  {att.fileName} <span className="text-xs text-slate-500">({att.category})</span>
                </a>
                {isDraftEditable && (
                  <form action={deleteInvoiceAttachment}>
                    <input type="hidden" name="attachmentId" value={att.id} />
                    <button className="text-xs text-rose-300 hover:underline">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          {isDraftEditable && (
            <form action={uploadInvoiceAttachment} className="mt-4 flex items-center gap-2">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <select name="category" className="rounded-md border border-white/10 bg-slate-800/60 px-2 py-2 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400">
                <option value="TIMESHEET">Timesheet</option>
                <option value="OTHER">Other</option>
              </select>
              <input type="file" name="file" required className="text-sm text-slate-300" />
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Upload
              </button>
            </form>
          )}

          {isDraftEditable && siteEmployees.length > 0 && (
            <form action={attachGridExport} className="mt-6 border-t border-white/10 pt-4">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <p className="text-sm font-medium text-slate-300">Attach a grid snapshot for {invoice.site}</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/10 p-2">
                {siteEmployees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      name="employeeIds"
                      value={e.id}
                      defaultChecked
                      className="border-white/10 bg-slate-800"
                    />
                    {[e.firstName, e.lastName].filter(Boolean).join(" ") || "(unnamed)"}
                  </label>
                ))}
              </div>
              <button
                type="submit"
                className="mt-2 rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Attach grid snapshot
              </button>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Actions</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {isDraftEditable && invoice.lineItems.length > 0 && (
              <form action={submitInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500"
                >
                  Submit for review
                </button>
              </form>
            )}

            {isDraftEditable && invoice.lineItems.length === 0 && (
              <p className="self-center text-sm text-slate-500">
                Add at least one line item before you can submit.
              </p>
            )}

            {(isAM || isAdmin) && invoice.status === "SUBMITTED" && (
              <form action={approveInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                >
                  Approve
                </button>
              </form>
            )}

            {isAdmin && (invoice.status === "AM_APPROVED" || invoice.status === "ADMIN_APPROVED") && (
              <form action={approveAndSend}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                >
                  {invoice.status === "ADMIN_APPROVED" ? "Retry send to client" : "Approve & send to client"}
                </button>
              </form>
            )}

            {((isAM && invoice.status === "SUBMITTED") ||
              (isAdmin && (invoice.status === "SUBMITTED" || invoice.status === "AM_APPROVED"))) && (
              <form action={rejectInvoice} className="flex items-center gap-2">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <input
                  name="reason"
                  placeholder="Rejection reason"
                  required
                  className="rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
                />
                <button
                  type="submit"
                  className="rounded-md border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10"
                >
                  Reject
                </button>
              </form>
            )}

            {isOwner && (
              <form action={invoice.archived ? unarchiveInvoice : archiveInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
                >
                  {invoice.archived ? "Unarchive" : "Archive"}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
