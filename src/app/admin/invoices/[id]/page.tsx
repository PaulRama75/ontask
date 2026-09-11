import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole, getNavAccess, firstAllowedNavHref, getRestrictedSites } from "@/lib/rbac";
import AttachmentUploadForm from "../AttachmentUploadForm";
import DownloadAllButton from "../DownloadAllButton";
import {
  addLineItem,
  importLineItemsFromExcel,
  deleteLineItem,
  uploadInvoiceAttachment,
  deleteInvoiceAttachment,
  attachGridExport,
  submitInvoice,
  approveInvoice,
  rejectInvoice,
  approveInvoiceFinal,
  sendInvoiceToClient,
  archiveInvoice,
  unarchiveInvoice,
  replyToRejection,
  notifyNextRole,
  addInvoiceComment,
  updateClientName,
  updateInvoiceNumber,
  deleteInvoice,
} from "../actions";
import ConfirmSubmitButton from "../../ConfirmSubmitButton";

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
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) notFound();

  const isAM = me.role === "ACCOUNT_MANAGER";
  const isAdmin = isAdminRole(me.role);
  const isPMorPL = me.role === "PROJECT_MANAGER" || me.role === "PROJECT_LEAD";
  // Owner = whoever may edit this DRAFT: the PM/PL who created it, or ANY
  // admin (admins can fully manage every invoice, same as they bypass
  // restrictions everywhere else in this app — not just ones they created).
  const isOwner = isAdmin || (isPMorPL && invoice.createdByUserId === me.id);
  // PMs/PLs can also view (not necessarily edit) every invoice for a site
  // they've been granted under Site Access, not just ones they created.
  let canViewBySite = false;
  if (isPMorPL && !isOwner) {
    const restrictedSites = await getRestrictedSites(me.id);
    canViewBySite = !restrictedSites || restrictedSites.has(invoice.site);
  }
  // AMs only ever act on SUBMITTED/AM_APPROVED invoices (see the Actions
  // section below) — viewing a DRAFT serves no purpose and would let an AM
  // see a PM's in-progress invoice by guessing/sharing its URL before it's ready.
  const canView = isOwner || canViewBySite || (isAM && invoice.status !== "DRAFT");
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
    <main className="min-h-screen py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{invoice.site}</h1>
          <Link href="/admin/invoices" className="text-sm text-cyan-400 hover:underline">
            ← All invoices
          </Link>
        </div>

        <div className="mb-4 overflow-hidden rounded-lg border border-white/10 bg-slate-900/60 shadow-lg shadow-black/30 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Job No#</th>
                <th className="px-4 py-2">PO#</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 text-slate-200">{invoice.site}</td>
                <td className="px-4 py-2 text-slate-200">
                  {isOwner ? (
                    <form action={updateClientName} className="flex items-center gap-1">
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input
                        name="clientName"
                        defaultValue={invoice.client.name}
                        className="w-28 rounded border border-white/10 bg-slate-800/60 px-2 py-1 text-sm text-white focus:border-cyan-400 focus:ring-cyan-400"
                      />
                      <button className="text-xs text-cyan-400 hover:underline">Save</button>
                    </form>
                  ) : (
                    invoice.client.name
                  )}
                </td>
                <td className="px-4 py-2">
                  <a href={`mailto:${invoice.client.email}`} className="text-cyan-400 hover:underline">
                    {invoice.client.email}
                  </a>
                </td>
                <td className="px-4 py-2 text-slate-200">{invoice.jobNumber || "—"}</td>
                <td className="px-4 py-2 text-slate-200">{invoice.poNumber || "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {invoice.archived && (
          <span className="inline-block rounded-md bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300">
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

          {isDraftEditable && (
            <form action={importLineItemsFromExcel} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input
                type="file"
                name="file"
                accept=".xlsx"
                required
                className="text-sm text-slate-300"
              />
              <button
                type="submit"
                className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Import from Excel
              </button>
              <span className="text-xs text-slate-500">Columns: Description, Amount</span>
            </form>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Attachments</h2>
            {invoice.attachments.length > 1 && (
              <DownloadAllButton attachmentIds={invoice.attachments.map((a) => a.id)} />
            )}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {invoice.attachments.length === 0 && <li className="text-slate-500">No attachments yet.</li>}
            {invoice.attachments.map((att) => (
              <li key={att.id} className="flex items-center justify-between gap-3">
                <a
                  href={`/api/invoice-files/${att.id}`}
                  target="_blank"
                  className="text-cyan-400 hover:underline"
                >
                  {att.fileName} <span className="text-xs text-slate-500">({att.category})</span>
                </a>
                <span className="flex items-center gap-3">
                  <a
                    href={`/api/invoice-files/${att.id}?dl=1`}
                    className="text-xs font-medium text-cyan-400 hover:underline"
                  >
                    Download
                  </a>
                  {isDraftEditable && (
                    <form action={deleteInvoiceAttachment}>
                      <input type="hidden" name="attachmentId" value={att.id} />
                      <button className="text-xs text-rose-300 hover:underline">Remove</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {isDraftEditable && (
            <AttachmentUploadForm invoiceId={invoice.id} action={uploadInvoiceAttachment} />
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Comments</h2>
            {isOwner ? (
              <form action={updateInvoiceNumber} className="flex items-center gap-1">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <label className="text-xs text-slate-400">Invoice#</label>
                <input
                  name="invoiceNumber"
                  defaultValue={invoice.invoiceNumber ?? ""}
                  placeholder="—"
                  className="w-24 rounded border border-white/10 bg-slate-800/60 px-2 py-1 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
                />
                <button className="text-xs text-cyan-400 hover:underline">Save</button>
              </form>
            ) : (
              <span className="text-xs text-slate-400">Invoice# {invoice.invoiceNumber || "—"}</span>
            )}
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            {invoice.comments.length === 0 && <li className="text-slate-500">No comments yet.</li>}
            {invoice.comments.map((c) => (
              <li key={c.id} className="rounded-md border border-white/10 bg-slate-800/40 p-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium text-slate-300">{c.authorName}</span>
                  <span>
                    {c.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-200">{c.message}</p>
              </li>
            ))}
          </ul>

          <form action={addInvoiceComment} className="mt-4 flex items-start gap-2">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <textarea
              name="message"
              rows={2}
              required
              placeholder="Add a comment…"
              className="flex-1 resize-y rounded-md border border-white/10 bg-slate-800/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400"
            />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Post
            </button>
          </form>
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

            {isAdmin && invoice.status === "AM_APPROVED" && (
              <form action={approveInvoiceFinal}>
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
              <form action={sendInvoiceToClient}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow shadow-blue-900/40 hover:bg-blue-500"
                >
                  Send
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

            {invoice.status === "SUBMITTED" && isOwner && (
              <form action={notifyNextRole}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10"
                >
                  Email Account Managers
                </button>
              </form>
            )}

            {invoice.status === "AM_APPROVED" && (isAM || isOwner) && (
              <form action={notifyNextRole}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-md border border-cyan-500/40 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/10"
                >
                  Email Admins
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

            {me.role === "SUPER_ADMIN" && (
              <form action={deleteInvoice}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <ConfirmSubmitButton
                  confirmMessage={`Permanently delete the invoice for ${invoice.site}? This can't be undone.`}
                  className="rounded-md border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10"
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
